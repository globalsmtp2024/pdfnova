import csv
import html
import io
import re
from collections import Counter
from collections.abc import Sequence
from typing import Any, Literal

import pdfplumber
import pypdfium2 as pdfium
from pptx import Presentation
from pptx.util import Emu, Pt
from pydantic import Field

from app.tools.base import (
    InputFile,
    InputFileInfo,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.batch import run_each
from app.tools.convert.office_out import OFFICE_SPEC, clean, in_any_box, line_style
from app.tools.convert.text import validate_pages
from app.tools.pages import parse_page_ranges

PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
EMU_PER_POINT = 12700
FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def guarded_cell(value: str) -> str:
    return "'" + value if value.startswith(FORMULA_STARTS) else value


def open_plumber(item: InputFile) -> pdfplumber.pdf.PDF:
    try:
        return pdfplumber.open(item.path)
    except Exception as exc:
        raise ToolFailedError("This PDF could not be read.", code="pdf_unreadable") from exc


class PdfToPowerPointOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=2000)
    mode: Literal["editable", "picture"] = "editable"
    dpi: int = Field(default=150, ge=72, le=300)


class PdfToPowerPointTool(Tool[PdfToPowerPointOptions]):
    slug = "pdf-to-powerpoint"
    name = "PDF to PowerPoint"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Turn each PDF page into a slide, with editable text boxes or a page picture."
    input_spec = OFFICE_SPEC
    options_schema = PdfToPowerPointOptions
    seconds_per_page = 0.3

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PdfToPowerPointOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[PdfToPowerPointOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            deck = Presentation()
            blank = deck.slide_layouts[6]
            renderer = pdfium.PdfDocument(str(item.path)) if options.mode == "picture" else None
            with open_plumber(item) as pdf:
                selection = parse_page_ranges(options.pages, len(pdf.pages))
                first = pdf.pages[selection[0]]
                deck.slide_width = Emu(int(first.width * EMU_PER_POINT))
                deck.slide_height = Emu(int(first.height * EMU_PER_POINT))
                for position, index in enumerate(selection):
                    ctx.ensure_not_cancelled()
                    ctx.report(position / len(selection), f"Building slide {position + 1}")
                    page = pdf.pages[index]
                    slide = deck.slides.add_slide(blank)
                    if renderer is not None:
                        bitmap = renderer[index].render(scale=options.dpi / 72).to_pil().convert("RGB")
                        buffer = io.BytesIO()
                        bitmap.save(buffer, format="JPEG", quality=88)
                        buffer.seek(0)
                        slide.shapes.add_picture(buffer, 0, 0, deck.slide_width, deck.slide_height)
                        continue
                    for line in page.extract_text_lines(strip=True, return_chars=True):
                        size, bold = line_style(line)
                        box = slide.shapes.add_textbox(
                            Emu(int(line["x0"] * EMU_PER_POINT)),
                            Emu(int(line["top"] * EMU_PER_POINT)),
                            Emu(int((line["x1"] - line["x0"] + 8) * EMU_PER_POINT)),
                            Emu(int((line["bottom"] - line["top"]) * EMU_PER_POINT)),
                        )
                        frame = box.text_frame
                        frame.word_wrap = False
                        frame.margin_left = frame.margin_right = frame.margin_top = frame.margin_bottom = 0
                        run = frame.paragraphs[0].add_run()
                        run.text = clean(line["text"])
                        run.font.size = Pt(max(min(size or 12, 72), 4))
                        run.font.bold = bold
            target = ctx.output_path(f"{item.stem}.pptx")
            deck.save(str(target))
            return [OutputFile(path=target, filename=target.name, mime_type=PPTX_MIME)]

        return run_each(ctx, handle, "Converting file")


class PdfToHtmlOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=2000)
    include_tables: bool = True


HTML_HEAD = (
    '<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>'
    "<style>body{{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.5}}"
    "table{{border-collapse:collapse;margin:1rem 0}}td,th{{border:1px solid #888;padding:.3rem .6rem}}"
    "section{{border-top:1px solid #ccc;padding-top:1rem;margin-top:1rem}}</style></head><body>"
)


class PdfToHtmlTool(Tool[PdfToHtmlOptions]):
    slug = "pdf-to-html"
    name = "PDF to HTML"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Convert a PDF into a clean HTML page with headings, paragraphs and tables."
    input_spec = OFFICE_SPEC
    options_schema = PdfToHtmlOptions
    seconds_per_page = 0.12

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PdfToHtmlOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[PdfToHtmlOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            parts: list[str] = [HTML_HEAD.format(title=html.escape(item.stem))]
            with open_plumber(item) as pdf:
                selection = parse_page_ranges(options.pages, len(pdf.pages))
                sizes: Counter[float] = Counter()
                parsed: list[tuple[list[dict[str, Any]], list[Any]]] = []
                for position, index in enumerate(selection):
                    ctx.ensure_not_cancelled()
                    ctx.report(position / len(selection) * 0.8, f"Reading page {index + 1}")
                    page = pdf.pages[index]
                    tables = page.find_tables() if options.include_tables else []
                    lines = page.extract_text_lines(strip=True, return_chars=True)
                    for line in lines:
                        sizes[line_style(line)[0]] += len(line["text"])
                    parsed.append((lines, tables))
                body = sizes.most_common(1)[0][0] if sizes else 11.0
                for number, (lines, tables) in enumerate(parsed, start=1):
                    boxes = [tuple(float(v) for v in table.bbox) for table in tables]
                    blocks: list[tuple[float, str, Any]] = [
                        (line["top"], "line", line) for line in lines if not in_any_box(line, boxes)
                    ]
                    blocks.extend((table.bbox[1], "table", table) for table in tables)
                    blocks.sort(key=lambda entry: entry[0])
                    parts.append(f'<section id="page-{number}">')
                    open_paragraph = False
                    previous_bottom: float | None = None
                    for top, kind, value in blocks:
                        if kind == "table":
                            if open_paragraph:
                                parts.append("</p>")
                                open_paragraph = False
                            parts.append("<table>")
                            for row in value.extract():
                                cells = "".join(f"<td>{html.escape(clean(cell or ''))}</td>" for cell in row)
                                parts.append(f"<tr>{cells}</tr>")
                            parts.append("</table>")
                            previous_bottom = value.bbox[3]
                            continue
                        size, bold = line_style(value)
                        text = html.escape(clean(value["text"]))
                        ratio = size / body if body else 1.0
                        gap = top - previous_bottom if previous_bottom is not None else 0.0
                        if ratio >= 1.25:
                            if open_paragraph:
                                parts.append("</p>")
                                open_paragraph = False
                            level = 1 if ratio >= 1.8 else 2 if ratio >= 1.45 else 3
                            parts.append(f"<h{level}>{text}</h{level}>")
                        elif open_paragraph and gap < max(size, 1.0) * 0.9:
                            parts.append(" " + text)
                        else:
                            if open_paragraph:
                                parts.append("</p>")
                            parts.append(f"<p>{'<strong>' + text + '</strong>' if bold else text}")
                            open_paragraph = True
                        previous_bottom = value["bottom"]
                    if open_paragraph:
                        parts.append("</p>")
                    parts.append("</section>")
            parts.append("</body></html>")
            target = ctx.output_path(f"{item.stem}.html")
            target.write_text("\n".join(parts), encoding="utf-8")
            return [OutputFile(path=target, filename=target.name, mime_type="text/html")]

        return run_each(ctx, handle, "Converting file")


class PdfToCsvOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=2000)
    delimiter: Literal["comma", "semicolon", "tab"] = "comma"
    guard_formulas: bool = True


DELIMITERS = {"comma": ",", "semicolon": ";", "tab": "\t"}


class PdfToCsvTool(Tool[PdfToCsvOptions]):
    slug = "pdf-to-csv"
    name = "PDF to CSV"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Extract each table in a PDF as a CSV file."
    input_spec = OFFICE_SPEC
    options_schema = PdfToCsvOptions
    seconds_per_page = 0.12

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PdfToCsvOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[PdfToCsvOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            outputs: list[OutputFile] = []
            with open_plumber(item) as pdf:
                selection = parse_page_ranges(options.pages, len(pdf.pages))
                for position, index in enumerate(selection):
                    ctx.ensure_not_cancelled()
                    ctx.report(position / len(selection), f"Reading page {index + 1}")
                    tables = [table for table in pdf.pages[index].extract_tables() if table and any(table)]
                    for number, table in enumerate(tables, start=1):
                        buffer = io.StringIO(newline="")
                        writer = csv.writer(buffer, delimiter=DELIMITERS[options.delimiter])
                        for row in table:
                            cells = [re.sub(r"\s+", " ", clean(str(cell or ""))).strip() for cell in row]
                            writer.writerow([guarded_cell(c) if options.guard_formulas else c for c in cells])
                        target = ctx.output_path(f"{item.stem}-page{index + 1}-table{number}.csv")
                        target.write_text("﻿" + buffer.getvalue(), encoding="utf-8")
                        outputs.append(OutputFile(path=target, filename=target.name, mime_type="text/csv"))
            if not outputs:
                raise ToolFailedError("No tables were found in this PDF.", code="nothing_found")
            return outputs

        return run_each(ctx, handle, "Converting file")
