import posixpath
import re
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

import pikepdf
from lxml import etree
from lxml import html as lxml_html
from pydantic import Field

from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.batch import run_each
from app.tools.convert.external import PAGE_CSS, HtmlToPdfOptions, render_html
from app.tools.pdfkit import output_pdf, pdf_name, save_pdf

MAX_ENTRIES = 5000
MAX_ENTRY_BYTES = 60 * 1024 * 1024
MAX_TOTAL_BYTES = 400 * 1024 * 1024
MAX_CHAPTERS = 200
XML_PARSER = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
CONTAINER_NS = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
OPF_NS = {
    "o": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}
NCX_NS = {"n": "http://www.daisy.org/z3986/2005/ncx/"}
XHTML_NS = {"x": "http://www.w3.org/1999/xhtml", "e": "http://www.idpf.org/2007/ops"}
UNSAFE_TAGS = ("script", "iframe", "object", "embed", "applet", "base", "form", "meta", "frame", "frameset")


class EpubToPdfOptions(ToolOptions):
    page_size: str = Field(default="A4", pattern="^(A4|Letter|Legal|A3)$")
    margin_mm: float = Field(default=18.0, ge=0, le=50)
    font_size_pt: float = Field(default=11.0, ge=7, le=24)
    add_bookmarks: bool = True


@dataclass(frozen=True)
class Chapter:
    path: str
    title: str


def safe_member(name: str) -> PurePosixPath | None:
    if not name or name.endswith("/") or "\\" in name or "\x00" in name:
        return None
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or any(part.startswith("~") for part in path.parts):
        return None
    return path


def extract_epub(source: Path, root: Path) -> set[str]:
    written: set[str] = set()
    try:
        archive = zipfile.ZipFile(source)
    except zipfile.BadZipFile as exc:
        raise ToolFailedError("This EPUB is damaged.", code="epub_invalid") from exc
    with archive:
        infos = archive.infolist()
        if len(infos) > MAX_ENTRIES:
            raise ToolFailedError("This EPUB contains too many files.", code="epub_unsafe")
        total = 0
        root = root.resolve()
        for info in infos:
            member = safe_member(info.filename)
            if member is None:
                continue
            if info.file_size > MAX_ENTRY_BYTES:
                raise ToolFailedError("This EPUB contains a file that is too large.", code="epub_unsafe")
            total += info.file_size
            if total > MAX_TOTAL_BYTES:
                raise ToolFailedError("This EPUB expands to an unsafe size.", code="epub_unsafe")
            target = (root / Path(*member.parts)).resolve()
            if root not in target.parents:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            copied = 0
            with archive.open(info) as reader, target.open("wb") as writer:
                while True:
                    chunk = reader.read(1024 * 1024)
                    if not chunk:
                        break
                    copied += len(chunk)
                    if copied > MAX_ENTRY_BYTES:
                        raise ToolFailedError("This EPUB contains a file that is too large.", code="epub_unsafe")
                    writer.write(chunk)
            written.add(member.as_posix())
    return written


def parse_xml(path: Path) -> etree._Element:
    try:
        return etree.fromstring(path.read_bytes(), XML_PARSER)
    except etree.XMLSyntaxError as exc:
        raise ToolFailedError("This EPUB is damaged.", code="epub_invalid") from exc


def resolve_href(base: str, href: str) -> str | None:
    parts = urlsplit(href)
    if parts.scheme or parts.netloc:
        return None
    joined = posixpath.normpath(posixpath.join(posixpath.dirname(base), unquote(parts.path)))
    return None if joined.startswith("..") or joined.startswith("/") else joined


def table_of_contents(root: Path, opf_path: str, opf: etree._Element, manifest: dict[str, dict[str, str]]) -> dict[str, str]:
    titles: dict[str, str] = {}
    nav_item = next((item for item in manifest.values() if "nav" in item.get("properties", "").split()), None)
    if nav_item:
        nav_path = resolve_href(opf_path, nav_item["href"])
        if nav_path and (root / nav_path).is_file():
            try:
                document = lxml_html.fromstring((root / nav_path).read_bytes())
                for anchor in document.xpath("//nav//a[@href]"):
                    target = resolve_href(nav_path, anchor.get("href", "").split("#")[0])
                    text = " ".join(anchor.text_content().split())
                    if target and text and target not in titles:
                        titles[target] = text[:200]
            except (etree.ParserError, ValueError):
                pass
    spine = opf.find("o:spine", OPF_NS)
    ncx_id = spine.get("toc") if spine is not None else None
    ncx_item = manifest.get(ncx_id or "")
    if ncx_item and not titles:
        ncx_path = resolve_href(opf_path, ncx_item["href"])
        if ncx_path and (root / ncx_path).is_file():
            ncx = parse_xml(root / ncx_path)
            for point in ncx.iterfind(".//n:navPoint", NCX_NS):
                label = point.find("n:navLabel/n:text", NCX_NS)
                content = point.find("n:content", NCX_NS)
                if label is None or content is None or not label.text:
                    continue
                target = resolve_href(ncx_path, (content.get("src") or "").split("#")[0])
                if target and target not in titles:
                    titles[target] = " ".join(label.text.split())[:200]
    return titles


def read_book(root: Path, files: set[str]) -> tuple[str, list[Chapter]]:
    container = root / "META-INF" / "container.xml"
    if not container.is_file():
        raise ToolFailedError("This is not a valid EPUB.", code="epub_invalid")
    rootfile = parse_xml(container).find(".//c:rootfile", CONTAINER_NS)
    opf_path = safe_member(rootfile.get("full-path", "") if rootfile is not None else "")
    if opf_path is None or opf_path.as_posix() not in files:
        raise ToolFailedError("This is not a valid EPUB.", code="epub_invalid")
    opf_name = opf_path.as_posix()
    opf = parse_xml(root / opf_name)
    manifest = {
        item.get("id", ""): {key: item.get(key, "") for key in ("href", "media-type", "properties")}
        for item in opf.iterfind(".//o:manifest/o:item", OPF_NS)
    }
    titles = table_of_contents(root, opf_name, opf, manifest)
    title_node = opf.find(".//dc:title", OPF_NS)
    book_title = " ".join((title_node.text or "").split()) if title_node is not None else ""
    chapters: list[Chapter] = []
    for number, itemref in enumerate(opf.iterfind(".//o:spine/o:itemref", OPF_NS), start=1):
        item = manifest.get(itemref.get("idref", ""))
        if not item or "html" not in item.get("media-type", ""):
            continue
        path = resolve_href(opf_name, item["href"])
        if path is None or path not in files:
            continue
        chapters.append(Chapter(path=path, title=titles.get(path, f"Chapter {number}")))
    if not chapters:
        raise ToolFailedError("This EPUB has no readable chapters.", code="epub_invalid")
    return book_title or "EPUB", chapters[:MAX_CHAPTERS]


REMOTE = re.compile(r"^\s*(?:[a-z][a-z0-9+.-]*:)?//", re.IGNORECASE)


def sanitize(source: Path, options: EpubToPdfOptions) -> bytes:
    try:
        document = lxml_html.fromstring(source.read_bytes())
    except (etree.ParserError, ValueError) as exc:
        raise ToolFailedError("A chapter of this EPUB could not be read.", code="epub_invalid") from exc
    for element in list(document.iter()):
        if not isinstance(element.tag, str):
            continue
        tag = element.tag.lower()
        if tag in UNSAFE_TAGS:
            parent = element.getparent()
            if parent is not None:
                parent.remove(element)
            continue
        for attribute in list(element.attrib):
            value = element.attrib[attribute]
            if attribute.lower().startswith("on") or value.strip().lower().startswith("javascript:"):
                del element.attrib[attribute]
            elif attribute.lower() in {"src", "href", "poster", "data"} and REMOTE.match(value) and tag != "a":
                del element.attrib[attribute]
        if tag == "link" and REMOTE.match(element.get("href", "")):
            parent = element.getparent()
            if parent is not None:
                parent.remove(element)
    head = document.find("head")
    if head is None:
        head = etree.SubElement(document, "head")
        document.insert(0, head)
    style = etree.SubElement(head, "style")
    style.text = (
        f"@page{{size:{PAGE_CSS[options.page_size]};margin:{options.margin_mm}mm}}"
        f"body{{font-size:{options.font_size_pt}pt}}img,svg{{max-width:100%;height:auto}}"
    )
    return lxml_html.tostring(document, encoding="utf-8", doctype="<!doctype html>")


class EpubToPdfTool(Tool[EpubToPdfOptions]):
    slug = "epub-to-pdf"
    name = "EPUB to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Convert an e-book to PDF with one bookmark per chapter."
    input_spec = InputSpec(min_files=1, max_files=5, accepted_kinds=frozenset({FileKind.EPUB}))
    options_schema = EpubToPdfOptions
    seconds_per_mb = 4.0
    seconds_per_page = 1.0

    def run(self, ctx: JobContext[EpubToPdfOptions]) -> list[OutputFile]:
        options = ctx.options
        render_options = HtmlToPdfOptions(page_size=options.page_size, margin_mm=options.margin_mm)  # type: ignore[arg-type]

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            root = ctx.scratch_dir / f"epub-{abs(hash(item.path))}"
            shutil.rmtree(root, ignore_errors=True)
            root.mkdir(parents=True)
            files = extract_epub(item.path, root)
            title, chapters = read_book(root, files)
            parts: list[tuple[Path, str]] = []
            for number, chapter in enumerate(chapters, start=1):
                ctx.ensure_not_cancelled()
                ctx.report(number / (len(chapters) + 1), f"Rendering chapter {number} of {len(chapters)}")
                staged = (root / Path(*PurePosixPath(chapter.path).parts)).with_name(f"__render-{number}.html")
                staged.write_bytes(sanitize(root / Path(*PurePosixPath(chapter.path).parts), options))
                rendered = ctx.scratch_dir / f"chapter-{abs(hash(item.path))}-{number}.pdf"
                render_html(staged, rendered, render_options, ctx.scratch_dir)
                parts.append((rendered, chapter.title))
            with pikepdf.new() as merged:
                starts: list[tuple[int, str]] = []
                for rendered, chapter_title in parts:
                    with pikepdf.open(rendered) as piece:
                        starts.append((len(merged.pages), chapter_title))
                        merged.pages.extend(piece.pages)
                if options.add_bookmarks:
                    with merged.open_outline() as outline:
                        for page_index, chapter_title in starts:
                            outline.root.append(pikepdf.OutlineItem(chapter_title, page_index))
                merged.docinfo["/Title"] = pikepdf.String(title[:200])
                target = ctx.output_path(pdf_name(item.stem, "book"))
                save_pdf(merged, target)
            shutil.rmtree(root, ignore_errors=True)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Converting book")
