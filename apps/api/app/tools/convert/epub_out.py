import html
import io
import re
import uuid
import zipfile
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any, Literal

import pypdfium2 as pdfium
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
from app.tools.convert.office_more import open_plumber
from app.tools.convert.office_out import OFFICE_SPEC, clean, in_any_box, line_style
from app.tools.convert.text import validate_pages
from app.tools.pages import parse_page_ranges
from app.tools.pdfkit import open_pdf, outline_entries

EPUB_MIME = "application/epub+zip"
FALLBACK_CHAPTER_PAGES = 10
ARABIC_SCRIPT = re.compile(r"[؀-ۿݐ-ݿ]")
COVER_WIDTH = 900
Block = tuple[int, str, Any]
Chapter = tuple[str, list[Block]]


class PdfToEpubOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=2000)
    language: Literal["auto", "en", "ur", "ar", "fr", "de", "es"] = "auto"
    include_tables: bool = True
    include_cover: bool = True
    title: str = Field(default="", max_length=200)
    author: str = Field(default="", max_length=200)


def page_blocks(
    item: InputFile, selection: list[int], include_tables: bool, ctx: JobContext[Any]
) -> list[Block]:
    blocks: list[Block] = []
    with open_plumber(item) as pdf:
        parsed: list[tuple[int, list[dict[str, Any]], list[Any]]] = []
        sizes: Counter[float] = Counter()
        for position, index in enumerate(selection):
            ctx.ensure_not_cancelled()
            ctx.report(position / max(len(selection), 1) * 0.6, f"Reading page {index + 1}")
            page = pdf.pages[index]
            tables = page.find_tables() if include_tables else []
            lines = page.extract_text_lines(strip=True, return_chars=True)
            for line in lines:
                sizes[line_style(line)[0]] += len(line["text"])
            parsed.append((index, lines, tables))
        body = sizes.most_common(1)[0][0] if sizes else 11.0
        for index, lines, tables in parsed:
            boxes = [tuple(float(value) for value in table.bbox) for table in tables]
            entries: list[tuple[float, str, Any]] = [
                (line["top"], "line", line) for line in lines if not in_any_box(line, boxes)
            ]
            entries.extend((table.bbox[1], "table", table) for table in tables)
            entries.sort(key=lambda entry: entry[0])
            paragraph: list[str] = []
            previous_bottom: float | None = None

            def flush(page_index: int = index, buffer: list[str] = paragraph) -> None:
                if buffer:
                    blocks.append((page_index, "p", " ".join(buffer)))
                    buffer.clear()

            for top, kind, value in entries:
                if kind == "table":
                    flush()
                    rows = [[clean(cell or "") for cell in row] for row in value.extract()]
                    blocks.append((index, "table", rows))
                    previous_bottom = value.bbox[3]
                    continue
                size, _ = line_style(value)
                text = clean(value["text"])
                ratio = size / body if body else 1.0
                gap = top - previous_bottom if previous_bottom is not None else 0.0
                if ratio >= 1.25:
                    flush()
                    level = 1 if ratio >= 1.8 else 2 if ratio >= 1.45 else 3
                    blocks.append((index, f"h{level}", text))
                elif paragraph and gap < max(size, 1.0) * 0.9:
                    paragraph.append(text)
                else:
                    flush()
                    paragraph.append(text)
                previous_bottom = value["bottom"]
            flush()
    return blocks


def split_chapters(item: InputFile, blocks: list[Block], selection: list[int], stem: str) -> list[Chapter]:
    marks: list[tuple[int, str]] = []
    try:
        with open_pdf(item) as pdf:
            for title, page, _children in outline_entries(pdf):
                if page is not None and page in selection and title.strip():
                    marks.append((page, title.strip()[:200]))
    except Exception:
        marks = []
    marks.sort()
    deduped: list[tuple[int, str]] = []
    for page, title in marks:
        if not deduped or deduped[-1][0] != page:
            deduped.append((page, title))
    if deduped:
        if deduped[0][0] != selection[0]:
            deduped.insert(0, (selection[0], stem))
        chapters: list[Chapter] = [(title, []) for _, title in deduped]
        starts = [page for page, _ in deduped]
        for block in blocks:
            slot = max(index for index, start in enumerate(starts) if start <= block[0])
            chapters[slot][1].append(block)
        return [chapter for chapter in chapters if chapter[1]] or [(stem, blocks)]
    level = (
        1
        if any(block[1] == "h1" for block in blocks)
        else 2
        if any(block[1] == "h2" for block in blocks)
        else 0
    )
    if level:
        heading = f"h{level}"
        chapters = [(stem, [])]
        for block in blocks:
            if block[1] == heading or (level == 2 and block[1] == "h1"):
                chapters.append((str(block[2])[:200], []))
            chapters[-1][1].append(block)
        return [chapter for chapter in chapters if chapter[1]]
    grouped: list[Chapter] = []
    for start in range(0, len(selection), FALLBACK_CHAPTER_PAGES):
        pages = set(selection[start : start + FALLBACK_CHAPTER_PAGES])
        chunk = [block for block in blocks if block[0] in pages]
        if chunk:
            grouped.append((f"Pages {min(pages) + 1}-{max(pages) + 1}", chunk))
    return grouped or [(stem, blocks)]


def block_xhtml(block: Block) -> str:
    _, kind, value = block
    if kind == "table":
        rows = "".join(
            "<tr>" + "".join(f"<td>{html.escape(cell)}</td>" for cell in row) + "</tr>" for row in value
        )
        return f"<table>{rows}</table>"
    return f"<{kind}>{html.escape(str(value))}</{kind}>"


def chapter_xhtml(title: str, blocks: list[Block], language: str, rtl: bool) -> str:
    body = "\n".join(block_xhtml(block) for block in blocks)
    direction = ' dir="rtl"' if rtl else ""
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
        f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '
        f'xml:lang="{language}" lang="{language}"{direction}><head><meta charset="utf-8"/>'
        f"<title>{html.escape(title)}</title>"
        '<link rel="stylesheet" type="text/css" href="style.css"/></head>'
        f"<body>{body}</body></html>"
    )


STYLE = (
    "body{font-family:serif;line-height:1.5;margin:5%}h1,h2,h3{font-family:sans-serif;line-height:1.2}"
    "table{border-collapse:collapse;margin:1em 0}td{border:1px solid #888;padding:.2em .5em}"
    "img{max-width:100%}"
)


def cover_jpeg(item: InputFile) -> bytes | None:
    try:
        document = pdfium.PdfDocument(str(item.path))
    except pdfium.PdfiumError:
        return None
    try:
        page = document[0]
        width, _ = page.get_size()
        image = page.render(scale=COVER_WIDTH / max(width, 1)).to_pil().convert("RGB")
        page.close()
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=85)
        return buffer.getvalue()
    finally:
        document.close()


def build_epub(
    chapters: list[Chapter], title: str, author: str, language: str, rtl: bool, cover: bytes | None
) -> bytes:
    identifier = f"urn:uuid:{uuid.uuid4()}"
    modified = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="css" href="style.css" media-type="text/css"/>',
    ]
    spine: list[str] = []
    files: dict[str, bytes | str] = {}
    if cover:
        files["OEBPS/cover.jpg"] = cover
        files["OEBPS/cover.xhtml"] = (
            '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
            '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>Cover</title></head>'
            '<body style="margin:0;text-align:center"><img src="cover.jpg" alt="Cover" style="max-width:100%"/></body></html>'
        )
        manifest.append(
            '<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
        )
        manifest.append('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>')
        spine.append('<itemref idref="cover" linear="no"/>')
    nav_items: list[str] = []
    ncx_points: list[str] = []
    for number, (chapter_title, blocks) in enumerate(chapters, start=1):
        name = f"chapter-{number:03d}.xhtml"
        files[f"OEBPS/{name}"] = chapter_xhtml(chapter_title, blocks, language, rtl)
        manifest.append(f'<item id="c{number}" href="{name}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="c{number}"/>')
        nav_items.append(f'<li><a href="{name}">{html.escape(chapter_title)}</a></li>')
        ncx_points.append(
            f'<navPoint id="n{number}" playOrder="{number}"><navLabel><text>{html.escape(chapter_title)}</text></navLabel>'
            f'<content src="{name}"/></navPoint>'
        )
    direction = ' dir="rtl"' if rtl else ""
    files["OEBPS/nav.xhtml"] = (
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '
        f'xml:lang="{language}"{direction}><head><meta charset="utf-8"/><title>{html.escape(title)}</title></head>'
        f'<body><nav epub:type="toc" id="toc"><h1>{html.escape(title)}</h1><ol>{"".join(nav_items)}</ol></nav></body></html>'
    )
    files["OEBPS/toc.ncx"] = (
        '<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">'
        f'<head><meta name="dtb:uid" content="{identifier}"/></head><docTitle><text>{html.escape(title)}</text></docTitle>'
        f"<navMap>{''.join(ncx_points)}</navMap></ncx>"
    )
    files["OEBPS/style.css"] = STYLE
    creator = f"<dc:creator>{html.escape(author)}</dc:creator>" if author else ""
    cover_meta = '<meta name="cover" content="cover-image"/>' if cover else ""
    progression = ' page-progression-direction="rtl"' if rtl else ""
    files["OEBPS/content.opf"] = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">'
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
        f'<dc:identifier id="book-id">{identifier}</dc:identifier><dc:title>{html.escape(title)}</dc:title>'
        f"<dc:language>{language}</dc:language>{creator}"
        f'<meta property="dcterms:modified">{modified}</meta>{cover_meta}</metadata>'
        f'<manifest>{"".join(manifest)}</manifest><spine toc="ncx"{progression}>{"".join(spine)}</spine></package>'
    )
    files["META-INF/container.xml"] = (
        '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
        '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(zipfile.ZipInfo("mimetype"), EPUB_MIME, compress_type=zipfile.ZIP_STORED)
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


class PdfToEpubTool(Tool[PdfToEpubOptions]):
    slug = "pdf-to-epub"
    name = "PDF to EPUB"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Turn a PDF into a reflowable e-book with a table of contents and a cover."
    input_spec = OFFICE_SPEC
    options_schema = PdfToEpubOptions
    seconds_per_page = 0.15

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PdfToEpubOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[PdfToEpubOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            with open_plumber(item) as probe:
                selection = parse_page_ranges(options.pages, len(probe.pages))
            blocks = page_blocks(item, selection, options.include_tables, ctx)
            if not blocks:
                raise ToolFailedError(
                    "No selectable text was found. Run OCR PDF first if this is a scan.", code="no_text"
                )
            sample = " ".join(str(block[2]) for block in blocks if block[1] != "table")[:4000]
            arabic = len(ARABIC_SCRIPT.findall(sample)) > len(sample) * 0.3
            language = ("ur" if arabic else "en") if options.language == "auto" else options.language
            rtl = language in {"ur", "ar"} or (options.language == "auto" and arabic)
            title = options.title or item.stem
            chapters = split_chapters(item, blocks, selection, title)
            ctx.report(0.8, "Building e-book")
            cover = cover_jpeg(item) if options.include_cover else None
            data = build_epub(chapters, title, options.author, language, rtl, cover)
            target = ctx.output_path(f"{item.stem}.epub")
            target.write_bytes(data)
            return [OutputFile(path=target, filename=target.name, mime_type=EPUB_MIME)]

        return run_each(ctx, handle, "Converting file")
