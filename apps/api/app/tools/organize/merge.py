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
)
from app.tools.organize.page_tools import OrganizeOperation
from app.tools.pages import parse_page_ranges
from app.tools.pdfkit import open_pdf, outline_entries, output_pdf, pdf_name, save_pdf

Rotation = Literal[0, 90, 180, 270]
FormFieldMode = Literal["preserve", "discard"]
OutlineEntry = tuple[str, int | None, list[Any]]
PlannedPage = tuple[int | None, int, int, tuple[float, float] | None]


class MergeFileOptions(ToolOptions):
    pages: str | None = Field(default=None, max_length=500, description="Page ranges such as 1-3,5,8-last")
    rotate: Rotation = 0
    bookmark_title: str | None = Field(default=None, max_length=200)


class MergeOptions(ToolOptions):
    files: list[MergeFileOptions] = Field(default_factory=list, max_length=1000)
    pages: list[OrganizeOperation] | None = Field(default=None, min_length=1, max_length=20000)
    add_bookmarks: bool = True
    keep_existing_bookmarks: bool = True
    form_fields: FormFieldMode = "preserve"
    output_name: str = Field(default="merged.pdf", max_length=180)


class MergeTool(Tool[MergeOptions]):
    slug = "merge"
    name = "Merge PDF"
    category = ToolCategory.ORGANIZE
    summary = "Combine PDFs file by file or page by page, keeping forms, bookmarks and rotation."
    input_spec = InputSpec(
        min_files=2, max_files=1000, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = MergeOptions
    seconds_per_page = 0.002

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: MergeOptions) -> None:
        if options.files and len(options.files) != len(files):
            raise ToolInputError(
                "Per-file settings do not match the number of uploaded files.",
                hint="Send one settings entry per file, in the same order.",
            )
        if options.pages is not None:
            for operation in options.pages:
                if operation.source == "blank":
                    continue
                if operation.file >= len(files):
                    raise ToolInputError("A page refers to a file that was not uploaded.")
                count = files[operation.file].page_count
                if count is not None and operation.page > count:
                    raise ToolInputError(
                        f"Page {operation.page} doesn't exist in {files[operation.file].name}."
                    )
            return
        for info, file_options in zip(files, options.files, strict=False):
            if info.page_count is not None:
                parse_page_ranges(file_options.pages, info.page_count)

    def run(self, ctx: JobContext[MergeOptions]) -> list[OutputFile]:
        options = ctx.options
        per_file = options.files or [MergeFileOptions() for _ in ctx.inputs]
        sources: list[pikepdf.Pdf] = []
        try:
            for index, item in enumerate(ctx.inputs):
                ctx.ensure_not_cancelled()
                ctx.report(index / len(ctx.inputs) * 0.3, f"Opening file {index + 1} of {len(ctx.inputs)}")
                sources.append(open_pdf(item))
            plan = self._plan(options, per_file, sources)
            with pikepdf.new() as merged:
                positions = self._assemble(ctx, merged, sources, plan)
                if options.form_fields == "preserve":
                    self._merge_forms(merged, sources, positions)
                else:
                    self._discard_forms(merged)
                titles = [
                    entry.bookmark_title or item.stem
                    for entry, item in zip(per_file, ctx.inputs, strict=True)
                ]
                self._build_outline(merged, sources, positions, titles, options)
                ctx.report(0.95, "Saving merged document")
                target = ctx.output_path(pdf_name(options.output_name, "merged.pdf"))
                save_pdf(merged, target)
        finally:
            for source in sources:
                source.close()
        ctx.report(1.0, "Done")
        return [output_pdf(target)]

    @staticmethod
    def _plan(
        options: MergeOptions, per_file: list[MergeFileOptions], sources: list[pikepdf.Pdf]
    ) -> list[PlannedPage]:
        if options.pages is None:
            return [
                (file_index, page_index, file_options.rotate, None)
                for file_index, (source, file_options) in enumerate(zip(sources, per_file, strict=True))
                for page_index in parse_page_ranges(file_options.pages, len(source.pages))
            ]
        plan: list[PlannedPage] = []
        for operation in options.pages:
            if operation.source == "blank":
                size = (operation.width, operation.height) if operation.width and operation.height else None
                plan.append((None, 0, operation.rotate, size))
                continue
            if operation.file >= len(sources) or operation.page > len(sources[operation.file].pages):
                raise ToolInputError(f"Page {operation.page} doesn't exist in file {operation.file + 1}.")
            plan.append((operation.file, operation.page - 1, operation.rotate, None))
        return plan

    @staticmethod
    def _assemble(
        ctx: JobContext[MergeOptions],
        merged: pikepdf.Pdf,
        sources: list[pikepdf.Pdf],
        plan: list[PlannedPage],
    ) -> list[dict[int, int]]:
        positions: list[dict[int, int]] = [{} for _ in sources]
        last_size = (595.0, 842.0)
        for position, (file_index, page_index, rotate, size) in enumerate(plan):
            if position % 50 == 0:
                ctx.ensure_not_cancelled()
                ctx.report(0.3 + position / len(plan) * 0.55, f"Adding page {position + 1} of {len(plan)}")
            if file_index is None:
                merged.add_blank_page(page_size=size or last_size)
            else:
                page = sources[file_index].pages[page_index]
                merged.pages.append(page)
                box = page.mediabox
                last_size = (abs(float(box[2]) - float(box[0])), abs(float(box[3]) - float(box[1])))
                positions[file_index].setdefault(page_index, len(merged.pages) - 1)
            if rotate:
                merged.pages[-1].rotate(rotate, relative=True)
        return positions

    @staticmethod
    def _build_outline(
        merged: pikepdf.Pdf,
        sources: list[pikepdf.Pdf],
        positions: list[dict[int, int]],
        titles: list[str],
        options: MergeOptions,
    ) -> None:
        used = sorted(
            (min(mapping.values()), file_index) for file_index, mapping in enumerate(positions) if mapping
        )
        items: list[pikepdf.OutlineItem] = []
        for first_position, file_index in used:
            existing = (
                _outline_items(outline_entries(sources[file_index]), positions[file_index])
                if options.keep_existing_bookmarks
                else []
            )
            if options.add_bookmarks:
                entry = pikepdf.OutlineItem(titles[file_index], first_position)
                entry.children.extend(existing)
                items.append(entry)
            else:
                items.extend(existing)
        if items:
            with merged.open_outline() as outline:
                outline.root.extend(items)

    @staticmethod
    def _merge_forms(
        merged: pikepdf.Pdf, sources: list[pikepdf.Pdf], positions: list[dict[int, int]]
    ) -> None:
        fields: list[pikepdf.Object] = []
        names: set[str] = set()
        resources = pikepdf.Dictionary()
        appearance: pikepdf.Object | None = None
        for file_index, (source, mapping) in enumerate(zip(sources, positions, strict=True)):
            form = source.Root.get("/AcroForm")
            if not mapping or not isinstance(form, pikepdf.Dictionary):
                continue
            source_fields = _items(form.get("/Fields"))
            annotations = {
                annotation.objgen
                for page_index in mapping
                for annotation in _items(source.pages[page_index].obj.get("/Annots"))
                if isinstance(annotation, pikepdf.Dictionary)
            }
            for field in source_fields:
                if not isinstance(field, pikepdf.Dictionary) or not _touches(field, annotations):
                    continue
                copied = merged.copy_foreign(field)
                title: Any = field.get("/T")
                name = str(title) if title is not None else ""
                if name:
                    unique = name
                    while unique in names:
                        unique = f"{file_index + 1}_{unique}"
                    names.add(unique)
                    if unique != name:
                        copied.T = pikepdf.String(unique)
                fields.append(copied)
            if appearance is None and "/DA" in form:
                appearance = pikepdf.String(str(form.DA))
            source_resources = form.get("/DR")
            if isinstance(source_resources, pikepdf.Dictionary):
                for category, entries in source_resources.items():
                    if not isinstance(entries, pikepdf.Dictionary):
                        continue
                    target = resources.get(category)
                    if not isinstance(target, pikepdf.Dictionary):
                        target = pikepdf.Dictionary()
                        resources[category] = target
                    for key, value in entries.items():
                        if key not in target:
                            target[key] = _import(merged, value)
        if not fields:
            return
        form_dictionary = pikepdf.Dictionary(Fields=pikepdf.Array(fields))
        if len(resources):
            form_dictionary.DR = resources
        if appearance is not None:
            form_dictionary.DA = appearance
        merged.Root.AcroForm = merged.make_indirect(form_dictionary)

    @staticmethod
    def _discard_forms(merged: pikepdf.Pdf) -> None:
        for page in merged.pages:
            annotations = _items(page.obj.get("/Annots"))
            if not annotations:
                continue
            kept = [
                annotation
                for annotation in annotations
                if not (
                    isinstance(annotation, pikepdf.Dictionary)
                    and annotation.get("/Subtype") == pikepdf.Name.Widget
                )
            ]
            if len(kept) == len(annotations):
                continue
            if kept:
                page.obj.Annots = pikepdf.Array(kept)
            else:
                del page.obj["/Annots"]
        if "/AcroForm" in merged.Root:
            del merged.Root["/AcroForm"]


def _items(value: Any) -> list[Any]:
    return [value[index] for index in range(len(value))] if isinstance(value, pikepdf.Array) else []


def _import(target: pikepdf.Pdf, value: Any) -> Any:
    if isinstance(value, pikepdf.Object) and value.is_indirect:
        return target.copy_foreign(value)
    if isinstance(value, pikepdf.Dictionary):
        return pikepdf.Dictionary({key: _import(target, item) for key, item in value.items()})
    if isinstance(value, pikepdf.Array):
        return pikepdf.Array([_import(target, item) for item in _items(value)])
    return value


def _touches(field: pikepdf.Dictionary, annotations: set[tuple[int, int]]) -> bool:
    if field.objgen in annotations:
        return True
    return any(
        isinstance(kid, pikepdf.Dictionary) and _touches(kid, annotations)
        for kid in _items(field.get("/Kids"))
    )


def _outline_items(entries: Sequence[OutlineEntry], mapping: dict[int, int]) -> list[pikepdf.OutlineItem]:
    def build(entry: OutlineEntry) -> pikepdf.OutlineItem | None:
        title, page, children = entry
        built_children = [child for child in (build(child) for child in children) if child is not None]
        if page is not None and page in mapping:
            item = pikepdf.OutlineItem(title, mapping[page])
        elif built_children:
            first = built_children[0].destination
            item = pikepdf.OutlineItem(title, first if isinstance(first, int) else min(mapping.values()))
        else:
            return None
        item.children.extend(built_children)
        return item

    return [item for item in (build(entry) for entry in entries) if item is not None]
