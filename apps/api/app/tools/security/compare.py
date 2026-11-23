import base64
import difflib
import html
import io
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

import pypdfium2 as pdfium
from PIL import Image, ImageChops, ImageFilter
from pydantic import Field
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.tools.base import (
    InputFileInfo,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)

MAX_COMPARE_PAGES = 400
MAX_VISUAL_PAGES = 100
INK_THRESHOLD = 170
REMOVED_COLOR = (220, 38, 38)
ADDED_COLOR = (22, 163, 74)
WASH = 0.65
STYLE = (
    "body{font-family:system-ui,sans-serif;margin:2rem;max-width:60rem}"
    "ins{background:#c8f7c5;text-decoration:none}del{background:#ffc9c9}"
    "h2{margin-top:2rem}pre{white-space:pre-wrap}.same{color:#667}"
)


class CompareOptions(ToolOptions):
    ignore_whitespace: bool = True
    granularity: Literal["words", "lines"] = "words"
    ignore_case: bool = False
    mode: Literal["both", "text", "visual"] = "both"
    visual_dpi: int = Field(default=80, ge=40, le=150)


def page_texts(path: str) -> list[str]:
    try:
        document = pdfium.PdfDocument(path)
    except pdfium.PdfiumError as exc:
        raise ToolFailedError("A PDF could not be read.", code="pdf_unreadable") from exc
    try:
        texts: list[str] = []
        for index in range(min(len(document), MAX_COMPARE_PAGES)):
            page = document[index]
            textpage = page.get_textpage()
            texts.append(textpage.get_text_bounded().replace("\r\n", "\n"))
            textpage.close()
            page.close()
        return texts
    finally:
        document.close()


def tokens(text: str, options: CompareOptions) -> list[str]:
    if options.ignore_case:
        text = text.lower()
    if options.granularity == "lines":
        lines = [line.strip() if options.ignore_whitespace else line for line in text.split("\n")]
        return [line for line in lines if line]
    return text.split() if options.ignore_whitespace else text.replace("\n", " \n ").split(" ")


def render_diff(first: list[str], second: list[str], joiner: str) -> tuple[str, int, int]:
    matcher = difflib.SequenceMatcher(a=first, b=second, autojunk=False)
    parts: list[str] = []
    removed = added = 0
    for tag, a0, a1, b0, b1 in matcher.get_opcodes():
        if tag == "equal":
            parts.append(html.escape(joiner.join(first[a0:a1])))
            continue
        if a1 > a0:
            removed += a1 - a0
            parts.append(f"<del>{html.escape(joiner.join(first[a0:a1]))}</del>")
        if b1 > b0:
            added += b1 - b0
            parts.append(f"<ins>{html.escape(joiner.join(second[b0:b1]))}</ins>")
    return joiner.join(parts), removed, added


def render_pages(path: Path, dpi: int) -> list[Image.Image]:
    document = pdfium.PdfDocument(str(path))
    try:
        images: list[Image.Image] = []
        for index in range(min(len(document), MAX_VISUAL_PAGES)):
            page = document[index]
            images.append(page.render(scale=dpi / 72).to_pil().convert("RGB"))
            page.close()
        return images
    finally:
        document.close()


def overlay_pair(first: Image.Image | None, second: Image.Image | None) -> tuple[Image.Image, float]:
    reference = second or first
    if reference is None:
        raise ToolFailedError("Nothing to compare.", code="nothing_found")
    size = reference.size
    blank = Image.new("RGB", size, (255, 255, 255))
    left = (first or blank).resize(size, Image.Resampling.BILINEAR)
    right = (second or blank).resize(size, Image.Resampling.BILINEAR)
    ink_left = left.convert("L").point(lambda value: 255 if value < INK_THRESHOLD else 0)
    ink_right = right.convert("L").point(lambda value: 255 if value < INK_THRESHOLD else 0)
    grown_left = ink_left.filter(ImageFilter.MaxFilter(3))
    grown_right = ink_right.filter(ImageFilter.MaxFilter(3))
    removed = ImageChops.subtract(ink_left, grown_right)
    added = ImageChops.subtract(ink_right, grown_left)
    base = Image.blend(right, blank, WASH)
    base.paste(REMOVED_COLOR, mask=removed)
    base.paste(ADDED_COLOR, mask=added)
    changed = removed.histogram()[255] + added.histogram()[255]
    return base, changed / (size[0] * size[1])


def build_overlay_pdf(images: list[Image.Image], target: Path) -> None:
    pdf = canvas.Canvas(str(target), pageCompression=1)
    for image in images:
        width, height = image.width * 72 / 150, image.height * 72 / 150
        pdf.setPageSize((width, height))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=85)
        buffer.seek(0)
        pdf.drawImage(ImageReader(buffer), 0, 0, width, height)
        pdf.showPage()
    pdf.save()


def embedded_preview(image: Image.Image) -> str:
    preview = image.copy()
    preview.thumbnail((760, 1100))
    buffer = io.BytesIO()
    preview.save(buffer, format="JPEG", quality=72)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


class ComparePdfTool(Tool[CompareOptions]):
    slug = "compare"
    name = "Compare PDF"
    category = ToolCategory.SECURITY
    summary = "Compare two PDFs by text and by appearance, with a colour-coded overlay and report."
    input_spec = InputSpec(min_files=2, max_files=2, accepted_kinds=frozenset({FileKind.PDF}))
    options_schema = CompareOptions
    seconds_per_page = 0.05

    def validate_inputs(self, files: Sequence[InputFileInfo], options: CompareOptions) -> None:
        super().validate_inputs(files, options)
        if len(files) != 2:
            raise ToolInputError("Choose exactly two PDFs to compare.")

    def run(self, ctx: JobContext[CompareOptions]) -> list[OutputFile]:
        options = ctx.options
        original, revised = ctx.inputs
        text_sections: list[str] = []
        text_summary = ""
        if options.mode in {"both", "text"}:
            text_sections, text_summary = self.text_report(ctx, original.path, revised.path)
        visual_sections: list[str] = []
        visual_summary = ""
        outputs: list[OutputFile] = []
        if options.mode in {"both", "visual"}:
            visual_sections, visual_summary, overlay = self.visual_report(ctx, original.path, revised.path)
            outputs.append(OutputFile(path=overlay, filename=overlay.name, mime_type="application/pdf"))
        summary = " ".join(part for part in (visual_summary, text_summary) if part)
        document = (
            "<!doctype html><meta charset='utf-8'><title>PDF comparison</title>"
            f"<style>{STYLE}img{{max-width:100%;border:1px solid #ccc}}</style><h1>PDF comparison</h1>"
            f"<p><b>{html.escape(original.original_name)}</b> compared with "
            f"<b>{html.escape(revised.original_name)}</b></p><p>{html.escape(summary)}</p>"
            "<p><span style='background:#fecaca'>Red</span> = only in the first file, "
            "<span style='background:#bbf7d0'>green</span> = only in the second.</p>"
            + ("<h2>Visual differences</h2>" + "".join(visual_sections) if visual_sections else "")
            + ("<h2>Text differences</h2>" + "".join(text_sections) if text_sections else "")
        )
        report = ctx.output_path("comparison.html")
        report.write_text(document, encoding="utf-8")
        text = ctx.output_path("comparison-summary.txt")
        text.write_text(summary + "\n", encoding="utf-8")
        outputs.insert(0, OutputFile(path=report, filename=report.name, mime_type="text/html"))
        outputs.append(OutputFile(path=text, filename=text.name, mime_type="text/plain"))
        return outputs

    def text_report(
        self, ctx: JobContext[CompareOptions], first: Path, second: Path
    ) -> tuple[list[str], str]:
        options = ctx.options
        first_pages = page_texts(str(first))
        second_pages = page_texts(str(second))
        joiner = "\n" if options.granularity == "lines" else " "
        sections: list[str] = []
        total_removed = total_added = changed_pages = 0
        count = max(len(first_pages), len(second_pages))
        for index in range(count):
            ctx.ensure_not_cancelled()
            ctx.report(0.5 + index / max(count, 1) * 0.1, f"Comparing text on page {index + 1}")
            left = tokens(first_pages[index], options) if index < len(first_pages) else []
            right = tokens(second_pages[index], options) if index < len(second_pages) else []
            body, removed, added = render_diff(left, right, joiner)
            total_removed += removed
            total_added += added
            if removed or added:
                changed_pages += 1
                sections.append(f"<h3>Page {index + 1}</h3><pre>{body}</pre>")
            else:
                sections.append(f"<h3 class='same'>Page {index + 1}: no text changes</h3>")
        summary = (
            f"Text: {changed_pages} of {len(sections)} pages changed; "
            f"{total_added} added and {total_removed} removed ({options.granularity})."
        )
        return sections, summary

    def visual_report(
        self, ctx: JobContext[CompareOptions], first: Path, second: Path
    ) -> tuple[list[str], str, Path]:
        dpi = ctx.options.visual_dpi
        left_pages = render_pages(first, dpi)
        right_pages = render_pages(second, dpi)
        count = max(len(left_pages), len(right_pages))
        overlays: list[Image.Image] = []
        sections: list[str] = []
        changed_pages = 0
        for index in range(count):
            ctx.ensure_not_cancelled()
            ctx.report(index / max(count, 1) * 0.5, f"Comparing appearance of page {index + 1}")
            overlay, ratio = overlay_pair(
                left_pages[index] if index < len(left_pages) else None,
                right_pages[index] if index < len(right_pages) else None,
            )
            overlays.append(overlay)
            if ratio > 0.0002:
                changed_pages += 1
                sections.append(
                    f"<h3>Page {index + 1}: {ratio * 100:.2f}% of the page differs</h3>"
                    f"<img alt='Differences on page {index + 1}' src='{embedded_preview(overlay)}'>"
                )
            else:
                sections.append(f"<h3 class='same'>Page {index + 1}: looks identical</h3>")
        target = ctx.output_path("comparison-overlay.pdf")
        build_overlay_pdf(overlays, target)
        summary = f"Appearance: {changed_pages} of {count} pages differ."
        if max(len(left_pages), len(right_pages)) >= MAX_VISUAL_PAGES:
            summary += f" Only the first {MAX_VISUAL_PAGES} pages were compared visually."
        return sections, summary, target
