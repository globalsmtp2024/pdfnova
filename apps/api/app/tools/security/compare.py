import difflib
import html
from typing import Literal

import pypdfium2 as pdfium
from pydantic import Field

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
STYLE = (
    "body{font-family:system-ui,sans-serif;margin:2rem;max-width:60rem}"
    "ins{background:#c8f7c5;text-decoration:none}del{background:#ffc9c9}"
    "h2{margin-top:2rem}pre{white-space:pre-wrap}.same{color:#667}"
)


class CompareOptions(ToolOptions):
    ignore_whitespace: bool = True
    granularity: Literal["words", "lines"] = "words"
    ignore_case: bool = False


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


class ComparePdfTool(Tool[CompareOptions]):
    slug = "compare"
    name = "Compare PDF"
    category = ToolCategory.SECURITY
    summary = "Compare the text of two PDFs and see exactly what was added and removed."
    input_spec = InputSpec(min_files=2, max_files=2, accepted_kinds=frozenset({FileKind.PDF}))
    options_schema = CompareOptions
    seconds_per_page = 0.05

    def validate_inputs(self, files: list[InputFileInfo], options: CompareOptions) -> None:  # type: ignore[override]
        super().validate_inputs(files, options)
        if len(files) != 2:
            raise ToolInputError("Choose exactly two PDFs to compare.")

    def run(self, ctx: JobContext[CompareOptions]) -> list[OutputFile]:
        options = ctx.options
        original, revised = ctx.inputs
        first_pages = page_texts(str(original.path))
        second_pages = page_texts(str(revised.path))
        joiner = "\n" if options.granularity == "lines" else " "
        sections: list[str] = []
        total_removed = total_added = changed_pages = 0
        for index in range(max(len(first_pages), len(second_pages))):
            ctx.ensure_not_cancelled()
            ctx.report(index / max(len(first_pages), len(second_pages), 1), f"Comparing page {index + 1}")
            left = tokens(first_pages[index], options) if index < len(first_pages) else []
            right = tokens(second_pages[index], options) if index < len(second_pages) else []
            body, removed, added = render_diff(left, right, joiner)
            total_removed += removed
            total_added += added
            if removed or added:
                changed_pages += 1
                sections.append(f"<h2>Page {index + 1}</h2><pre>{body}</pre>")
            else:
                sections.append(f"<h2 class='same'>Page {index + 1}: no changes</h2>")
        summary = (
            f"{changed_pages} of {len(sections)} pages changed; "
            f"{total_added} added and {total_removed} removed ({options.granularity})."
        )
        document = (
            "<!doctype html><meta charset='utf-8'><title>PDF comparison</title>"
            f"<style>{STYLE}</style><h1>PDF comparison</h1>"
            f"<p><b>{html.escape(original.original_name)}</b> compared with "
            f"<b>{html.escape(revised.original_name)}</b></p><p>{html.escape(summary)}</p>"
            + "".join(sections)
        )
        report = ctx.output_path("comparison.html")
        report.write_text(document, encoding="utf-8")
        text = ctx.output_path("comparison-summary.txt")
        text.write_text(summary + "\n", encoding="utf-8")
        return [
            OutputFile(path=report, filename=report.name, mime_type="text/html"),
            OutputFile(path=text, filename=text.name, mime_type="text/plain"),
        ]
