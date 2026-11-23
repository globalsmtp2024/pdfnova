import re
from collections import Counter
from collections.abc import Sequence
from typing import Any, Literal

import pdfplumber
from docx import Document
from docx.shared import Pt
from openpyxl import Workbook
from pydantic import Field

from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputFileInfo,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.batch import run_each
from app.tools.convert.text import validate_pages
from app.tools.formula_guard import append_text_row
from app.tools.pages import parse_page_ranges

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
OFFICE_SPEC = InputSpec(
    min_files=1, max_files=10, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)
MAX_CELL = 32000
ILLEGAL_XML = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
MAX_SHEET_NAME = 31


def clean(text: str) -> str:
    return ILLEGAL_XML.sub("", text)


def in_any_box(line: dict[str, Any], boxes: Sequence[tuple[float, ...]]) -> bool:
    center_x = (line["x0"] + line["x1"]) / 2
    center_y = (line["top"] + line["bottom"]) / 2
    return any(
        x0 <= center_x <= x1 and top <= center_y <= bottom
        for x0, top, x1, bottom in (box[:4] for box in boxes)
    )


def line_style(line: dict[str, Any]) -> tuple[float, bool]:
    chars = line.get("chars") or []
    if not chars:
        return 0.0, False
    sizes = Counter(round(float(char.get("size", 0)), 1) for char in chars)
    bold = sum("bold" in str(char.get("fontname", "")).lower() for char in chars) > len(chars) / 2
    return sizes.most_common(1)[0][0], bold


class PdfToWordOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=2000)
    include_tables: bool = True
    keep_page_breaks: bool = True


class PdfToWordTool(Tool[PdfToWordOptions]):
    slug = "pdf-to-word"
    name = "PDF to Word"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Convert a PDF into an editable Word document with headings, paragraphs and tables."
    input_spec = OFFICE_SPEC
    options_schema = PdfToWordOptions
    seconds_per_page = 0.15

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PdfToWordOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[PdfToWordOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            document = Document()
            try:
                pdf = pdfplumber.open(item.path)
            except Exception as exc:
                raise ToolFailedError("This PDF could not be read.", code="pdf_unreadable") from exc
            with pdf:
                selection = parse_page_ranges(options.pages, len(pdf.pages))
                sizes: Counter[float] = Counter()
                parsed: list[tuple[list[dict[str, Any]], list[Any]]] = []
                for index in selection:
                    page = pdf.pages[index]
                    tables = page.find_tables() if options.include_tables else []
                    lines = page.extract_text_lines(strip=True, return_chars=True)
                    for line in lines:
                        size, _ = line_style(line)
                        sizes[size] += len(line["text"])
                    parsed.append((lines, tables))
                    ctx.report(len(parsed) / len(selection) * 0.8, f"Reading page {index + 1}")
                body = sizes.most_common(1)[0][0] if sizes else 11.0
                for position, (lines, tables) in enumerate(parsed):
                    ctx.ensure_not_cancelled()
                    boxes = [tuple(table.bbox) for table in tables]
                    blocks: list[tuple[float, str, Any]] = [
                        (line["top"], "line", line) for line in lines if not in_any_box(line, boxes)
                    ]
                    blocks.extend((table.bbox[1], "table", table) for table in tables)
                    blocks.sort(key=lambda entry: entry[0])
                    previous_bottom: float | None = None
                    paragraph: Any = None
                    for top, kind, value in blocks:
                        if kind == "table":
                            rows = value.extract()
                            if rows and rows[0]:
                                grid = document.add_table(rows=len(rows), cols=max(len(row) for row in rows))
                                grid.style = "Table Grid"
                                for row_index, row in enumerate(rows):
                                    for column, cell in enumerate(row):
                                        grid.cell(row_index, column).text = clean(cell or "")
                            paragraph = None
                            previous_bottom = value.bbox[3]
                            continue
                        size, bold = line_style(value)
                        text = clean(value["text"])
                        ratio = size / body if body else 1.0
                        gap = top - previous_bottom if previous_bottom is not None else 0.0
                        if ratio >= 1.25:
                            level = 1 if ratio >= 1.8 else 2 if ratio >= 1.45 else 3
                            document.add_heading(text, level=level)
                            paragraph = None
                        elif paragraph is not None and gap < max(size, 1.0) * 0.9:
                            paragraph.add_run(" " + text)
                        else:
                            paragraph = document.add_paragraph()
                            run = paragraph.add_run(text)
                            run.bold = bold
                            run.font.size = Pt(max(min(size, 36), 6))
                        previous_bottom = value["bottom"]
                    if options.keep_page_breaks and position < len(parsed) - 1:
                        document.add_page_break()
            target = ctx.output_path(f"{item.stem}.docx")
            document.save(str(target))
            return [OutputFile(path=target, filename=target.name, mime_type=DOCX_MIME)]

        return run_each(ctx, handle, "Converting file")


class PdfToExcelOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=2000)
    layout: Literal["sheet_per_table", "sheet_per_page"] = "sheet_per_table"
    fallback_to_text: bool = True


def sheet_title(name: str, used: set[str]) -> str:
    base = name[:MAX_SHEET_NAME]
    candidate, counter = base, 1
    while candidate in used:
        counter += 1
        suffix = f" ({counter})"
        candidate = base[: MAX_SHEET_NAME - len(suffix)] + suffix
    used.add(candidate)
    return candidate


class PdfToExcelTool(Tool[PdfToExcelOptions]):
    slug = "pdf-to-excel"
    name = "PDF to Excel"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Pull the tables out of a PDF into an Excel workbook."
    input_spec = OFFICE_SPEC
    options_schema = PdfToExcelOptions
    seconds_per_page = 0.12

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PdfToExcelOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[PdfToExcelOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            workbook = Workbook()
            workbook.remove(workbook.active)
            used: set[str] = set()
            written = 0
            try:
                pdf = pdfplumber.open(item.path)
            except Exception as exc:
                raise ToolFailedError("This PDF could not be read.", code="pdf_unreadable") from exc
            with pdf:
                selection = parse_page_ranges(options.pages, len(pdf.pages))
                for position, index in enumerate(selection):
                    ctx.ensure_not_cancelled()
                    ctx.report(position / len(selection), f"Reading page {index + 1}")
                    page = pdf.pages[index]
                    tables = [table for table in page.extract_tables() if table and any(table)]
                    if not tables and options.fallback_to_text:
                        text = page.extract_text() or ""
                        rows = [
                            re.split(r"\s{2,}", line.strip()) for line in text.split("\n") if line.strip()
                        ]
                        tables = [rows] if rows else []
                    if options.layout == "sheet_per_page" and tables:
                        sheet = workbook.create_sheet(sheet_title(f"Page {index + 1}", used))
                        for table in tables:
                            for row in table:
                                append_text_row(sheet, [clean(str(cell or ""))[:MAX_CELL] for cell in row])
                            sheet.append([])
                        written += 1
                        continue
                    for number, table in enumerate(tables, start=1):
                        sheet = workbook.create_sheet(sheet_title(f"Page {index + 1} Table {number}", used))
                        for row in table:
                            append_text_row(sheet, [clean(str(cell or ""))[:MAX_CELL] for cell in row])
                        written += 1
            if written == 0:
                raise ToolFailedError("No tables or text were found in this PDF.", code="nothing_found")
            target = ctx.output_path(f"{item.stem}.xlsx")
            workbook.save(str(target))
            return [OutputFile(path=target, filename=target.name, mime_type=XLSX_MIME)]

        return run_each(ctx, handle, "Converting file")
