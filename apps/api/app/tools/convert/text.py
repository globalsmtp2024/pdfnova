import re
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Literal

import pypdfium2 as pdfium
from markdown_it import MarkdownIt
from markdown_it.token import Token
from pydantic import Field
from pypdf import PdfReader

from app.files.sniff import FileKind
from app.text.fonts import FontKey
from app.text.layout import A4_SIZE, LETTER_SIZE, Block, render_blocks
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
from app.tools.pages import parse_page_ranges
from app.tools.pdfkit import output_pdf, pdf_name, save_pdf

MAX_TEXT_BYTES = 20 * 1024 * 1024
PDF_SPEC = InputSpec(
    min_files=1, max_files=20, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)
TEXT_SPEC = InputSpec(
    min_files=1,
    max_files=20,
    accepted_kinds=frozenset({FileKind.TEXT, FileKind.MARKDOWN, FileKind.CSV}),
)
BULLETS = ("•", "◦", "▪", "‣", "-", "*", "–")


def decode_text(path: Path) -> str:
    data = path.read_bytes()[:MAX_TEXT_BYTES]
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            return data.decode(encoding)
        except UnicodeError:
            continue
    return data.decode("latin-1")


class PdfToTextOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=2000)
    page_markers: bool = True


def validate_pages(files: Sequence[InputFileInfo], expression: str | None) -> None:
    for info in files:
        if info.page_count is not None:
            parse_page_ranges(expression, info.page_count)


class PdfToTextTool(Tool[PdfToTextOptions]):
    slug = "pdf-to-text"
    name = "PDF to text"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Extract the text of a PDF into a plain text file."
    input_spec = PDF_SPEC
    options_schema = PdfToTextOptions
    seconds_per_page = 0.02

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PdfToTextOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[PdfToTextOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            try:
                document = pdfium.PdfDocument(str(item.path))
            except pdfium.PdfiumError as exc:
                raise ToolFailedError("This PDF could not be read.", code="pdf_unreadable") from exc
            parts: list[str] = []
            try:
                for index in parse_page_ranges(options.pages, len(document)):
                    ctx.ensure_not_cancelled()
                    page = document[index]
                    textpage = page.get_textpage()
                    text = textpage.get_text_bounded().replace("\r\n", "\n")
                    textpage.close()
                    page.close()
                    if options.page_markers:
                        parts.append(f"--- Page {index + 1} ---")
                    parts.append(text.strip())
            finally:
                document.close()
            target = ctx.output_path(f"{item.stem}.txt")
            target.write_text("\n\n".join(parts) + "\n", encoding="utf-8")
            return [OutputFile(path=target, filename=target.name, mime_type="text/plain")]

        return run_each(ctx, handle, "Extracting text from file")


class PdfToMarkdownOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=2000)
    page_separators: bool = False


def markdown_lines(reader: PdfReader, index: int) -> list[tuple[float, str]]:
    fragments: list[tuple[float, float, str]] = []

    def visitor(text: str, _cm: Any, tm: Any, _font: Any, font_size: float) -> None:
        if not text.strip():
            return
        scale = abs(tm[3]) or abs(tm[0]) or 1.0
        fragments.append((round(float(tm[5]), 0), float(font_size or 1.0) * scale, text))

    reader.pages[index].extract_text(visitor_text=visitor)
    ordered: dict[float, list[tuple[float, str]]] = {}
    for y, size, text in fragments:
        ordered.setdefault(y, []).append((size, text))
    lines: list[tuple[float, str]] = []
    for y in sorted(ordered, reverse=True):
        pieces = ordered[y]
        size = max(piece[0] for piece in pieces)
        lines.append((size, " ".join(piece[1].strip() for piece in pieces)))
    return lines


def to_markdown(lines: list[tuple[float, str]], body_size: float) -> list[str]:
    output: list[str] = []
    for size, text in lines:
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        ratio = size / body_size if body_size else 1.0
        if ratio >= 1.8:
            output.append(f"# {text}")
        elif ratio >= 1.4:
            output.append(f"## {text}")
        elif ratio >= 1.15:
            output.append(f"### {text}")
        elif text.startswith(BULLETS) and len(text) > 2:
            output.append(f"- {text[1:].strip()}")
        else:
            output.append(text)
    return output


class PdfToMarkdownTool(Tool[PdfToMarkdownOptions]):
    slug = "pdf-to-markdown"
    name = "PDF to Markdown"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Convert a PDF into Markdown with headings and lists."
    input_spec = PDF_SPEC
    options_schema = PdfToMarkdownOptions
    seconds_per_page = 0.05

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PdfToMarkdownOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[PdfToMarkdownOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            reader = PdfReader(str(item.path))
            selection = parse_page_ranges(options.pages, len(reader.pages))
            per_page = [markdown_lines(reader, index) for index in selection]
            counts: Counter[float] = Counter()
            for lines in per_page:
                for size, text in lines:
                    counts[round(size, 1)] += len(text)
            body = counts.most_common(1)[0][0] if counts else 1.0
            blocks: list[str] = []
            for lines in per_page:
                ctx.ensure_not_cancelled()
                blocks.append("\n\n".join(to_markdown(lines, body)))
            separator = "\n\n---\n\n" if options.page_separators else "\n\n"
            target = ctx.output_path(f"{item.stem}.md")
            target.write_text(separator.join(blocks).strip() + "\n", encoding="utf-8")
            return [OutputFile(path=target, filename=target.name, mime_type="text/markdown")]

        return run_each(ctx, handle, "Converting file")


class TextToPdfOptions(ToolOptions):
    font: Literal["noto-sans", "noto-serif", "noto-sans-mono"] = "noto-sans"
    size: float = Field(default=11.0, ge=6, le=36)
    page_size: Literal["a4", "letter"] = "a4"
    margin_mm: float = Field(default=20.0, ge=5, le=50)


def page_dimensions(name: str) -> tuple[float, float]:
    return A4_SIZE if name == "a4" else LETTER_SIZE


class TextToPdfTool(Tool[TextToPdfOptions]):
    slug = "text-to-pdf"
    name = "Text to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Turn plain text into a clean PDF, including Urdu and Arabic."
    input_spec = TEXT_SPEC
    options_schema = TextToPdfOptions
    seconds_per_mb = 2.0

    def run(self, ctx: JobContext[TextToPdfOptions]) -> list[OutputFile]:
        options = ctx.options
        font: FontKey = options.font

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            text = decode_text(item.path)
            block = Block(text=text, size=options.size, font=font, preserve=font == "noto-sans-mono")
            pdf = render_blocks(
                [block], page_dimensions(options.page_size), options.margin_mm * 72 / 25.4
            )
            with pdf:
                target = ctx.output_path(pdf_name(item.stem, "text"))
                save_pdf(pdf, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Converting file")


class MarkdownToPdfOptions(ToolOptions):
    font: Literal["noto-sans", "noto-serif"] = "noto-sans"
    size: float = Field(default=11.0, ge=6, le=24)
    page_size: Literal["a4", "letter"] = "a4"
    margin_mm: float = Field(default=20.0, ge=5, le=50)


def inline_text(token: Token) -> str:
    parts: list[str] = []
    for child in token.children or []:
        if child.type in {"text", "code_inline"}:
            parts.append(child.content)
        elif child.type in {"softbreak", "hardbreak"}:
            parts.append(" " if child.type == "softbreak" else "\n")
        elif child.type == "image":
            parts.append(child.content)
    return "".join(parts)


HEADING_SIZES = {1: 2.0, 2: 1.6, 3: 1.35, 4: 1.2, 5: 1.1, 6: 1.0}


def markdown_blocks(text: str, options: MarkdownToPdfOptions) -> list[Block]:
    tokens = MarkdownIt("commonmark").enable("table").parse(text)
    blocks: list[Block] = []
    font: FontKey = options.font
    base = options.size
    depth = 0
    list_stack: list[list[int]] = []
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token.type == "heading_open":
            level = int(token.tag[1])
            content = inline_text(tokens[index + 1])
            blocks.append(
                Block(content, base * HEADING_SIZES[level], True, font, space_before=base, space_after=base * 0.5)
            )
        elif token.type in {"bullet_list_open", "ordered_list_open"}:
            list_stack.append([0 if token.type == "bullet_list_open" else 1])
            depth += 1
        elif token.type in {"bullet_list_close", "ordered_list_close"}:
            list_stack.pop()
            depth -= 1
        elif token.type == "paragraph_open":
            content = inline_text(tokens[index + 1])
            if list_stack:
                marker = "•" if list_stack[-1][0] == 0 else f"{list_stack[-1][0]}."
                if list_stack[-1][0] > 0:
                    list_stack[-1][0] += 1
                content = f"{marker} {content}"
            blocks.append(Block(content, base, False, font, indent=14.0 * depth if depth else 0.0))
        elif token.type in {"fence", "code_block"}:
            blocks.append(
                Block(token.content.rstrip("\n"), base * 0.9, False, "noto-sans-mono", indent=10.0, preserve=True)
            )
        elif token.type == "hr":
            blocks.append(Block("—" * 20, base, False, font, space_before=base * 0.5))
        elif token.type == "blockquote_open":
            depth += 1
        elif token.type == "blockquote_close":
            depth -= 1
        elif token.type == "tr_open":
            cells: list[str] = []
            lookahead = index + 1
            while tokens[lookahead].type != "tr_close":
                if tokens[lookahead].type == "inline":
                    cells.append(inline_text(tokens[lookahead]))
                lookahead += 1
            blocks.append(Block(" | ".join(cells), base * 0.95, False, "noto-sans-mono", preserve=True))
            index = lookahead
        index += 1
    return blocks


class MarkdownToPdfTool(Tool[MarkdownToPdfOptions]):
    slug = "markdown-to-pdf"
    name = "Markdown to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Turn Markdown into a formatted PDF with headings, lists, code and tables."
    input_spec = TEXT_SPEC
    options_schema = MarkdownToPdfOptions
    seconds_per_mb = 2.0

    def run(self, ctx: JobContext[MarkdownToPdfOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            blocks = markdown_blocks(decode_text(item.path), options)
            if not blocks:
                raise ToolFailedError("This file has no content to convert.", code="empty_input")
            pdf = render_blocks(
                blocks, page_dimensions(options.page_size), options.margin_mm * 72 / 25.4
            )
            with pdf:
                target = ctx.output_path(pdf_name(item.stem, "markdown"))
                save_pdf(pdf, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Converting file")
