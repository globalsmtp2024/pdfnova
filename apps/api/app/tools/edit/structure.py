from collections.abc import Sequence
from pathlib import Path
from typing import Any

import pikepdf
from pikepdf import Dictionary, Name, OutlineItem, String
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
    safe_filename,
)
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

SINGLE_PDF = InputSpec(
    min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)
MAX_BOOKMARKS = 5000
MAX_LINES = 2000
ALLOWED_SCHEMES = ("http://", "https://", "mailto:", "tel:")


class BookmarkOptions(ToolOptions):
    bookmarks: list[str] = Field(default_factory=list, max_length=MAX_BOOKMARKS)
    replace_existing: bool = True
    remove_all: bool = False


def parse_bookmark(line: str, page_count: int) -> tuple[str, int, int]:
    parts = [part.strip() for part in line.split("|")]
    if len(parts) < 2 or not parts[0]:
        raise ToolInputError(
            f"“{line}” is not a bookmark.",
            hint="Write one per line as: Title | page | level (level optional).",
        )
    try:
        page = int(parts[1])
        level = int(parts[2]) if len(parts) > 2 and parts[2] else 1
    except ValueError as exc:
        raise ToolInputError(f"“{line}” has a page or level that is not a number.") from exc
    if not 1 <= page <= page_count:
        raise ToolInputError(
            f"Bookmark “{parts[0]}” points at page {page}, but the document has {page_count}."
        )
    if level < 1 or level > 8:
        raise ToolInputError("Bookmark levels run from 1 to 8.")
    return parts[0][:200], page - 1, level


class BookmarksEditorTool(Tool[BookmarkOptions]):
    slug = "bookmarks"
    name = "Bookmarks editor"
    category = ToolCategory.EDIT
    summary = "Add, replace or remove the bookmarks (outline) of a PDF."
    input_spec = SINGLE_PDF
    options_schema = BookmarkOptions
    seconds_per_page = 0.003

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: BookmarkOptions
    ) -> None:
        for info in files:
            if info.page_count is not None:
                for line in options.bookmarks:
                    parse_bookmark(line, info.page_count)

    def run(self, ctx: JobContext[BookmarkOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        with open_pdf(item) as pdf:
            count = len(pdf.pages)
            entries = [parse_bookmark(line, count) for line in options.bookmarks]
            if not entries and not options.remove_all:
                raise ToolInputError("Add at least one bookmark, or choose to remove all bookmarks.")
            if options.remove_all and "/Outlines" in pdf.Root:
                del pdf.Root["/Outlines"]
            with pdf.open_outline() as outline:
                if options.replace_existing and not options.remove_all:
                    outline.root.clear()
                stack: list[list[OutlineItem]] = [outline.root]
                previous_level = 1
                for title, page, level in entries:
                    level = min(level, previous_level + 1)
                    item_node = OutlineItem(title, page)
                    del stack[level:]
                    stack[-1].append(item_node)
                    stack.append(item_node.children)
                    previous_level = level
            target = ctx.output_path(pdf_name(f"{item.stem}-bookmarks", "bookmarks"))
            save_pdf(pdf, target)
        return [output_pdf(target)]


class AttachmentOptions(ToolOptions):
    remove_all: bool = False
    remove_names: list[str] = Field(default_factory=list, max_length=200)
    extract_all: bool = False


ATTACHMENT_SPEC = InputSpec(
    min_files=1,
    max_files=20,
    accepted_kinds=frozenset(kind for kind in FileKind if kind is not FileKind.UNKNOWN),
    allow_encrypted_pdf=True,
)


class AttachmentsTool(Tool[AttachmentOptions]):
    slug = "attachments"
    name = "Attachments manager"
    category = ToolCategory.EDIT
    summary = "Attach files to a PDF, remove embedded files or extract them."
    input_spec = ATTACHMENT_SPEC
    options_schema = AttachmentOptions
    seconds_per_mb = 0.05

    def validate_inputs(self, files: Sequence[InputFileInfo], options: AttachmentOptions) -> None:
        super().validate_inputs(files, options)
        if files and files[0].kind is not FileKind.PDF:
            raise ToolInputError("The first file must be the PDF. Files after it are attached to it.")

    def run(self, ctx: JobContext[AttachmentOptions]) -> list[OutputFile]:
        options = ctx.options
        host = ctx.inputs[0]
        outputs: list[OutputFile] = []
        with open_pdf(host) as pdf:
            if options.extract_all:
                for name, spec in list(pdf.attachments.items()):
                    target = ctx.output_path(safe_filename(name, "attachment"))
                    target.write_bytes(spec.get_file().read_bytes())
                    outputs.append(
                        OutputFile(path=target, filename=target.name, mime_type="application/octet-stream")
                    )
            if options.remove_all:
                for name in list(pdf.attachments.keys()):
                    del pdf.attachments[name]
            for name in options.remove_names:
                if name in pdf.attachments:
                    del pdf.attachments[name]
            for extra in ctx.inputs[1:]:
                label = safe_filename(extra.original_name, "attachment")
                pdf.attachments[label] = pikepdf.AttachedFileSpec.from_filepath(pdf, Path(extra.path))
            target = ctx.output_path(pdf_name(f"{host.stem}-attachments", "attachments"))
            save_pdf(pdf, target)
            outputs.insert(0, output_pdf(target))
        return outputs


class LinkOptions(ToolOptions):
    remove_all: bool = False
    remove_external: bool = False
    add_links: list[str] = Field(default_factory=list, max_length=MAX_LINES)
    replace_urls: list[str] = Field(default_factory=list, max_length=200)


def parse_new_link(line: str, page_count: int) -> tuple[int, tuple[float, float, float, float], str]:
    parts = [part.strip() for part in line.split("|")]
    if len(parts) != 6:
        raise ToolInputError(
            f"“{line}” is not a link.", hint="Write: page | x | y | width | height | https://address"
        )
    try:
        page = int(parts[0])
        x, y, width, height = (float(value) for value in parts[1:5])
    except ValueError as exc:
        raise ToolInputError(f"“{line}” has a value that is not a number.") from exc
    if not 1 <= page <= page_count:
        raise ToolInputError(f"A link points at page {page}, but the document has {page_count}.")
    if width <= 0 or height <= 0:
        raise ToolInputError("Link width and height must be positive.")
    if not parts[5].lower().startswith(ALLOWED_SCHEMES):
        raise ToolInputError("Links must start with http://, https://, mailto: or tel:.")
    return page - 1, (x, y, x + width, y + height), parts[5]


def link_uri(annotation: Any) -> str | None:
    action = annotation.get("/A")
    if action is not None and str(action.get("/S", "")) == "/URI":
        return str(action.get("/URI", ""))
    return None


class HyperlinksTool(Tool[LinkOptions]):
    slug = "hyperlinks"
    name = "Hyperlinks manager"
    category = ToolCategory.EDIT
    summary = "List, add, rewrite or remove the links in a PDF."
    input_spec = SINGLE_PDF
    options_schema = LinkOptions
    seconds_per_page = 0.004

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: LinkOptions) -> None:
        for info in files:
            if info.page_count is not None:
                for line in options.add_links:
                    parse_new_link(line, info.page_count)

    def run(self, ctx: JobContext[LinkOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        replacements: list[tuple[str, str]] = []
        for line in options.replace_urls:
            if "=>" not in line:
                raise ToolInputError(f"“{line}” is not a rewrite rule.", hint="Write: old text => new text")
            old, new = (part.strip() for part in line.split("=>", 1))
            replacements.append((old, new))
        report: list[str] = []
        with open_pdf(item) as pdf:
            for number, page in enumerate(pdf.pages, start=1):
                annotations = page.obj.get("/Annots")
                if annotations is None:
                    continue
                kept = []
                for annotation in annotations:
                    if str(annotation.get("/Subtype", "")) != "/Link":
                        kept.append(annotation)
                        continue
                    uri = link_uri(annotation)
                    report.append(f"page {number}: {uri if uri is not None else '(internal link)'}")
                    if options.remove_all or (options.remove_external and uri is not None):
                        continue
                    if uri is not None:
                        for old, new in replacements:
                            if old and old in uri:
                                uri = uri.replace(old, new)
                        annotation.A = Dictionary(S=Name.URI, URI=String(uri))
                    kept.append(annotation)
                page.obj.Annots = pikepdf.Array(kept)
            for line in options.add_links:
                number, rect, url = parse_new_link(line, len(pdf.pages))
                link = pdf.make_indirect(
                    Dictionary(
                        Type=Name.Annot,
                        Subtype=Name.Link,
                        Rect=list(rect),
                        Border=[0, 0, 0],
                        A=Dictionary(S=Name.URI, URI=String(url)),
                    )
                )
                page = pdf.pages[number]
                if "/Annots" not in page.obj:
                    page.obj.Annots = pikepdf.Array()
                page.obj.Annots.append(link)
                report.append(f"page {number + 1}: {url} (added)")
            target = ctx.output_path(pdf_name(f"{item.stem}-links", "links"))
            save_pdf(pdf, target)
        listing = ctx.output_path(f"{item.stem}-links.txt")
        listing.write_text("\n".join(report) + "\n" if report else "No links found.\n", encoding="utf-8")
        if (
            not (options.remove_all or options.remove_external or options.add_links or replacements)
            and not report
        ):
            raise ToolFailedError("This PDF has no links.", code="no_links")
        return [output_pdf(target), OutputFile(path=listing, filename=listing.name, mime_type="text/plain")]
