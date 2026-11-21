import string
from collections.abc import Sequence
from typing import Literal

import pikepdf
from pydantic import Field, field_validator, model_validator

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputFileInfo,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolOptions,
    safe_filename,
)
from app.tools.batch import run_each
from app.tools.pages import parse_page_ranges, parse_page_set
from app.tools.pdfkit import (
    copy_document_info,
    new_pdf_from_pages,
    open_pdf,
    outline_entries,
    output_pdf,
    pdf_name,
    rebuild_outline,
    save_pdf,
)

Rotation = Literal[90, 180, 270]
BATCH_SPEC = InputSpec(
    min_files=1, max_files=100, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)
SINGLE_SPEC = InputSpec(
    min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)


def _check_expression(files: Sequence[InputFileInfo], expression: str | None) -> None:
    for info in files:
        if info.page_count is not None:
            parse_page_ranges(expression, info.page_count)


class RotateOptions(ToolOptions):
    angle: Rotation = 90
    pages: str | None = Field(default=None, max_length=2000)
    per_page: dict[int, Literal[0, 90, 180, 270]] = Field(default_factory=dict, max_length=10000)


class RotateTool(Tool[RotateOptions]):
    slug = "rotate"
    name = "Rotate PDF"
    category = ToolCategory.EDIT
    summary = "Rotate all pages, selected pages, odd or even pages, without re-rendering content."
    input_spec = BATCH_SPEC
    options_schema = RotateOptions
    seconds_per_page = 0.002

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: RotateOptions) -> None:
        _check_expression(files, options.pages)
        for info in files:
            if info.page_count is not None and any(
                page < 1 or page > info.page_count for page in options.per_page
            ):
                raise ToolInputError("A per-page rotation points at a page outside the document.")

    def run(self, ctx: JobContext[RotateOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            with open_pdf(item) as pdf:
                targets = parse_page_set(options.pages, len(pdf.pages)) if not options.per_page else []
                for index in targets:
                    pdf.pages[index].rotate(options.angle, relative=True)
                for page_number, angle in options.per_page.items():
                    if angle:
                        pdf.pages[page_number - 1].rotate(angle, relative=True)
                target = ctx.output_path(pdf_name(f"{item.stem}-rotated", "rotated"))
                save_pdf(pdf, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Rotating file")


class RemovePagesOptions(ToolOptions):
    pages: str = Field(min_length=1, max_length=2000)


class RemovePagesTool(Tool[RemovePagesOptions]):
    slug = "remove-pages"
    name = "Remove pages"
    category = ToolCategory.ORGANIZE
    summary = "Delete the pages you don't need, with bookmarks and links fixed up safely."
    input_spec = SINGLE_SPEC
    options_schema = RemovePagesOptions
    seconds_per_page = 0.002

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: RemovePagesOptions
    ) -> None:
        for info in files:
            if (
                info.page_count is not None
                and len(parse_page_set(options.pages, info.page_count)) >= info.page_count
            ):
                raise ToolInputError(
                    "You can't remove every page.", hint="Leave at least one page in the document."
                )

    def run(self, ctx: JobContext[RemovePagesOptions]) -> list[OutputFile]:
        item = ctx.inputs[0]
        ctx.report(0.1, "Reading pages")
        with open_pdf(item) as source:
            removed = set(parse_page_set(ctx.options.pages, len(source.pages)))
            keep = [index for index in range(len(source.pages)) if index not in removed]
            if not keep:
                raise ToolInputError(
                    "You can't remove every page.", hint="Leave at least one page in the document."
                )
            ctx.report(0.5, "Rewriting objects")
            result, _ = new_pdf_from_pages(source, keep)
            with result:
                target = ctx.output_path(pdf_name(f"{item.stem}-edited", "edited"))
                save_pdf(result, target)
        ctx.report(1.0, f"Removed {len(removed)} pages, {len(keep)} remain")
        return [output_pdf(target)]


class ExtractPagesOptions(ToolOptions):
    pages: str = Field(min_length=1, max_length=2000)
    mode: Literal["single", "separate"] = "single"


class ExtractPagesTool(Tool[ExtractPagesOptions]):
    slug = "extract-pages"
    name = "Extract pages"
    category = ToolCategory.ORGANIZE
    summary = "Copy selected pages into one new PDF or into separate files."
    input_spec = SINGLE_SPEC
    options_schema = ExtractPagesOptions
    seconds_per_page = 0.002

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: ExtractPagesOptions
    ) -> None:
        _check_expression(files, options.pages)

    def run(self, ctx: JobContext[ExtractPagesOptions]) -> list[OutputFile]:
        item = ctx.inputs[0]
        outputs: list[OutputFile] = []
        with open_pdf(item) as source:
            selection = parse_page_ranges(ctx.options.pages, len(source.pages))
            if ctx.options.mode == "single":
                result, _ = new_pdf_from_pages(source, selection)
                with result:
                    target = ctx.output_path(pdf_name(f"{item.stem}-extracted", "extracted"))
                    save_pdf(result, target)
                return [output_pdf(target)]
            for position, index in enumerate(selection):
                ctx.ensure_not_cancelled()
                ctx.report(position / len(selection), f"Extracting page {index + 1}")
                result, _ = new_pdf_from_pages(source, [index])
                with result:
                    target = ctx.output_path(pdf_name(f"{item.stem}_page-{index + 1:03d}", "page"))
                    save_pdf(result, target)
                outputs.append(output_pdf(target))
        return outputs


SplitMode = Literal["ranges", "every", "size", "bookmarks", "blank", "each"]
DEFAULT_TEMPLATE = "{name}_part-{part}_pages-{start}-{end}"


class SplitOptions(ToolOptions):
    mode: SplitMode = "ranges"
    ranges: list[str] = Field(default_factory=list, max_length=500)
    merge_ranges: bool = False
    every: int = Field(default=1, ge=1, le=10000)
    max_size_mb: float = Field(default=10, gt=0, le=2048)
    blank_threshold: float = Field(default=0.995, ge=0.9, le=1.0)
    remove_blank_pages: bool = True
    keep_bookmarks: bool = True
    filename_template: str = Field(default=DEFAULT_TEMPLATE, max_length=120)

    @field_validator("filename_template")
    @classmethod
    def _template_fields(cls, value: str) -> str:
        allowed = {"name", "part", "start", "end"}
        try:
            fields = {name for _, name, _, _ in string.Formatter().parse(value) if name is not None}
        except ValueError as exc:
            raise ValueError("The file name template has unbalanced braces.") from exc
        if not fields <= allowed:
            raise ValueError("Use only {name}, {part}, {start} and {end} in the file name template.")
        return value

    @model_validator(mode="after")
    def _ranges_needed(self) -> "SplitOptions":
        if self.mode == "ranges" and not [entry for entry in self.ranges if entry.strip()]:
            raise ValueError("Add at least one page range to split by.")
        return self


def _is_blank(path: str, index: int, threshold: float) -> bool:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(path)
    try:
        page = document[index]
        text = page.get_textpage()
        has_text = text.count_chars() > 0
        text.close()
        if has_text:
            return False
        image = page.render(scale=0.25).to_pil().convert("L")
        histogram: list[int] = image.histogram()
        light = sum(histogram[240:])
        ratio: float = light / max(image.width * image.height, 1)
        return ratio >= threshold
    finally:
        document.close()


class SplitTool(Tool[SplitOptions]):
    slug = "split"
    name = "Split PDF"
    category = ToolCategory.ORGANIZE
    summary = "Split by ranges, every N pages, file size, bookmarks or blank pages, or extract every page."
    input_spec = SINGLE_SPEC
    options_schema = SplitOptions
    seconds_per_page = 0.004

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: SplitOptions) -> None:
        if options.mode == "ranges":
            for expression in options.ranges:
                _check_expression(files, expression)

    def _groups(self, ctx: JobContext[SplitOptions], source: pikepdf.Pdf, item: InputFile) -> list[list[int]]:
        options = ctx.options
        count = len(source.pages)
        if options.mode == "ranges":
            groups = [
                parse_page_ranges(expression, count) for expression in options.ranges if expression.strip()
            ]
            return [[index for group in groups for index in group]] if options.merge_ranges else groups
        if options.mode == "every":
            return [
                list(range(start, min(start + options.every, count)))
                for start in range(0, count, options.every)
            ]
        if options.mode == "each":
            return [[index] for index in range(count)]
        if options.mode == "bookmarks":
            starts = sorted({page for _, page, _ in outline_entries(source) if page is not None} | {0})
            if len(starts) <= 1:
                raise ToolInputError(
                    "This PDF has no top-level bookmarks to split by.",
                    hint="Try splitting by ranges instead.",
                )
            return [list(range(start, end)) for start, end in zip(starts, [*starts[1:], count], strict=True)]
        if options.mode == "blank":
            sections: list[list[int]] = [[]]
            for index in range(count):
                ctx.ensure_not_cancelled()
                if _is_blank(str(item.path), index, options.blank_threshold):
                    if sections[-1]:
                        sections.append([])
                    if not options.remove_blank_pages:
                        sections[-1].append(index)
                else:
                    sections[-1].append(index)
            return [section for section in sections if section]
        return self._size_groups(ctx, source, int(options.max_size_mb * 1024 * 1024))

    def _size_groups(self, ctx: JobContext[SplitOptions], source: pikepdf.Pdf, limit: int) -> list[list[int]]:
        probe = ctx.scratch_dir / "size-probe.pdf"

        def size_of(indices: list[int]) -> int:
            result, _ = new_pdf_from_pages(source, indices, keep_outline=False, keep_info=False)
            with result:
                save_pdf(result, probe)
            return probe.stat().st_size

        groups: list[list[int]] = []
        start = 0
        count = len(source.pages)
        while start < count:
            ctx.ensure_not_cancelled()
            low, high = start + 1, count
            best = start + 1
            while low <= high:
                middle = (low + high) // 2
                if size_of(list(range(start, middle))) <= limit:
                    best = middle
                    low = middle + 1
                else:
                    high = middle - 1
            groups.append(list(range(start, best)))
            start = best
        return groups

    def run(self, ctx: JobContext[SplitOptions]) -> list[OutputFile]:
        item = ctx.inputs[0]
        outputs: list[OutputFile] = []
        ctx.report(0.05, "Reading pages")
        with open_pdf(item) as source:
            groups = self._groups(ctx, source, item)
            if not groups:
                raise ToolInputError("There is nothing to split.")
            entries = outline_entries(source) if ctx.options.keep_bookmarks else []
            for number, group in enumerate(groups, start=1):
                ctx.ensure_not_cancelled()
                ctx.report(0.2 + 0.75 * number / len(groups), f"Writing part {number} of {len(groups)}")
                part = pikepdf.new()
                mapping: dict[int, int] = {}
                for position, index in enumerate(group):
                    part.pages.append(source.pages[index])
                    mapping.setdefault(index, position)
                copy_document_info(source, part)
                if entries:
                    rebuild_outline(part, entries, mapping)
                filename = ctx.options.filename_template.format(
                    name=item.stem, part=f"{number:02d}", start=min(group) + 1, end=max(group) + 1
                )
                target = ctx.output_path(pdf_name(safe_filename(filename, f"part-{number:02d}"), "part"))
                with part:
                    save_pdf(part, target)
                outputs.append(output_pdf(target))
        return outputs


class OrganizeOperation(ToolOptions):
    source: Literal["file", "blank"] = "file"
    file: int = Field(default=0, ge=0, le=99)
    page: int = Field(default=1, ge=1)
    rotate: Literal[0, 90, 180, 270] = 0
    width: float | None = Field(default=None, gt=0, le=14400)
    height: float | None = Field(default=None, gt=0, le=14400)


class OrganizeOptions(ToolOptions):
    pages: list[OrganizeOperation] = Field(min_length=1, max_length=20000)
    output_name: str = Field(default="organized.pdf", max_length=180)
    keep_bookmarks: bool = True


class OrganizeTool(Tool[OrganizeOptions]):
    slug = "organize"
    name = "Organize PDF"
    category = ToolCategory.ORGANIZE
    summary = "Reorder, rotate, delete, duplicate and insert pages, including pages from other PDFs."
    input_spec = InputSpec(
        min_files=1, max_files=20, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = OrganizeOptions
    seconds_per_page = 0.002

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: OrganizeOptions
    ) -> None:
        for operation in options.pages:
            if operation.source == "blank":
                continue
            if operation.file >= len(files):
                raise ToolInputError("A page refers to a file that was not uploaded.")
            count = files[operation.file].page_count
            if count is not None and operation.page > count:
                raise ToolInputError(f"Page {operation.page} doesn't exist in {files[operation.file].name}.")

    def run(self, ctx: JobContext[OrganizeOptions]) -> list[OutputFile]:
        sources = [open_pdf(item) for item in ctx.inputs]
        try:
            result = pikepdf.new()
            mapping: dict[int, int] = {}
            total = len(ctx.options.pages)
            last_size = (595.0, 842.0)
            for position, operation in enumerate(ctx.options.pages):
                if position % 50 == 0:
                    ctx.ensure_not_cancelled()
                    ctx.report(position / total * 0.9, "Arranging pages")
                if operation.source == "blank":
                    width = operation.width or last_size[0]
                    height = operation.height or last_size[1]
                    result.add_blank_page(page_size=(width, height))
                else:
                    source = sources[operation.file]
                    if operation.page > len(source.pages):
                        raise ToolInputError(
                            f"Page {operation.page} doesn't exist in file {operation.file + 1}."
                        )
                    page = source.pages[operation.page - 1]
                    result.pages.append(page)
                    box = page.mediabox
                    last_size = (abs(float(box[2]) - float(box[0])), abs(float(box[3]) - float(box[1])))
                    if operation.file == 0:
                        mapping.setdefault(operation.page - 1, len(result.pages) - 1)
                if operation.rotate:
                    result.pages[-1].rotate(operation.rotate, relative=True)
            copy_document_info(sources[0], result)
            if ctx.options.keep_bookmarks:
                rebuild_outline(result, outline_entries(sources[0]), mapping)
            ctx.report(0.95, "Saving")
            target = ctx.output_path(pdf_name(ctx.options.output_name, "organized.pdf"))
            with result:
                save_pdf(result, target)
        finally:
            for source in sources:
                source.close()
        return [output_pdf(target)]
