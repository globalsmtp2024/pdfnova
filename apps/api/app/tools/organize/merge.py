from collections.abc import Sequence
from typing import Any, Literal

import pikepdf
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
    ToolOptions,
    safe_filename,
)
from app.tools.pages import parse_page_ranges

Rotation = Literal[0, 90, 180, 270]


class MergeFileOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=500, description="Page ranges such as 1-3,5,8-last")
    rotate: Rotation = 0
    bookmark_title: str | None = Field(default=None, max_length=200)


class MergeOptions(ToolOptions):
    files: list[MergeFileOptions] = Field(default_factory=list, max_length=1000)
    add_bookmarks: bool = True
    keep_existing_bookmarks: bool = True
    output_name: str = Field(default="merged.pdf", max_length=180)


class MergeTool(Tool[MergeOptions]):
    slug = "merge"
    name = "Merge PDF"
    category = ToolCategory.ORGANIZE
    summary = "Combine PDFs in any order, with per-file page ranges, rotation and bookmarks."
    input_spec = InputSpec(min_files=2, max_files=1000, accepted_kinds=frozenset({FileKind.PDF}))
    options_schema = MergeOptions

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: MergeOptions) -> None:
        if options.files and len(options.files) != len(files):
            raise ToolInputError(
                "Per-file settings do not match the number of uploaded files.",
                hint="Send one settings entry per file, in the same order.",
            )
        for info, file_options in zip(files, options.files, strict=False):
            if info.page_count is not None:
                parse_page_ranges(file_options.pages, info.page_count)

    def run(self, ctx: JobContext[MergeOptions]) -> list[OutputFile]:
        per_file = ctx.options.files or [MergeFileOptions() for _ in ctx.inputs]
        total = len(ctx.inputs)
        with pikepdf.new() as merged:
            outline_entries: list[pikepdf.OutlineItem] = []
            for index, (source, file_options) in enumerate(zip(ctx.inputs, per_file, strict=True)):
                ctx.ensure_not_cancelled()
                ctx.report(index / total * 0.9, f"Adding file {index + 1} of {total}")
                with pikepdf.open(source.path) as document:
                    selection = parse_page_ranges(file_options.pages, len(document.pages))
                    first_page_index = len(merged.pages)
                    existing_outline = (
                        self._copy_outline(document, selection, first_page_index)
                        if (ctx.options.keep_existing_bookmarks)
                        else []
                    )
                    for page_index in selection:
                        merged.pages.append(document.pages[page_index])
                        if file_options.rotate:
                            merged.pages[-1].rotate(file_options.rotate, relative=True)
                if ctx.options.add_bookmarks:
                    entry = pikepdf.OutlineItem(file_options.bookmark_title or source.stem, first_page_index)
                    entry.children.extend(existing_outline)
                    outline_entries.append(entry)
                else:
                    outline_entries.extend(existing_outline)
            if outline_entries:
                with merged.open_outline() as outline:
                    outline.root.extend(outline_entries)
            ctx.report(0.95, "Saving merged document")
            output_name = safe_filename(ctx.options.output_name, "merged.pdf")
            if not output_name.lower().endswith(".pdf"):
                output_name += ".pdf"
            target = ctx.output_path(output_name)
            merged.save(target, compress_streams=True, object_stream_mode=pikepdf.ObjectStreamMode.generate)
        ctx.report(1.0, "Done")
        return [OutputFile(path=target, filename=output_name, mime_type="application/pdf")]

    @staticmethod
    def _copy_outline(document: pikepdf.Pdf, selection: list[int], offset: int) -> list[pikepdf.OutlineItem]:
        position_of = {page_index: offset + order for order, page_index in enumerate(selection)}
        page_index_by_objgen: dict[Any, int] = {page.objgen: i for i, page in enumerate(document.pages)}

        def convert(item: pikepdf.OutlineItem) -> pikepdf.OutlineItem | None:
            children = [c for c in (convert(child) for child in item.children) if c is not None]
            target_index = MergeTool._resolve_outline_page(document, item, page_index_by_objgen)
            if target_index is not None and target_index in position_of:
                copied = pikepdf.OutlineItem(item.title, position_of[target_index])
            elif children:
                copied = pikepdf.OutlineItem(item.title, children_destination(children))
            else:
                return None
            copied.children.extend(children)
            return copied

        def children_destination(children: list[pikepdf.OutlineItem]) -> int:
            destination = children[0].destination
            if isinstance(destination, int):
                return destination
            return offset

        try:
            with document.open_outline() as outline:
                return [c for c in (convert(item) for item in outline.root) if c is not None]
        except (pikepdf.OutlineStructureError, pikepdf.PdfError, KeyError, ValueError):
            return []

    @staticmethod
    def _resolve_outline_page(
        document: pikepdf.Pdf, item: pikepdf.OutlineItem, page_index_by_objgen: dict[Any, int]
    ) -> int | None:
        destination: Any = item.destination
        if destination is None and item.action is not None and item.action.get("/S") == pikepdf.Name.GoTo:
            destination = item.action.get("/D")
        if isinstance(destination, (pikepdf.String, pikepdf.Name)):
            names = document.Root.get("/Names")
            dests = names.get("/Dests") if names is not None else None
            if dests is None:
                return None
            resolved = pikepdf.NameTree(dests).get(str(destination))
            if resolved is None:
                return None
            destination = resolved.get("/D") if isinstance(resolved, pikepdf.Dictionary) else resolved
        if isinstance(destination, pikepdf.Array) and len(destination) > 0:
            target = destination[0]
            if isinstance(target, int):
                return target
            if isinstance(target, pikepdf.Dictionary):
                return page_index_by_objgen.get(target.objgen)
        return None
