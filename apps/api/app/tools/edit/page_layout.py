from typing import Literal

import pikepdf
from pydantic import Field, model_validator

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolOptions,
)
from app.tools.batch import run_each
from app.tools.pdfkit import copy_document_info, open_pdf, output_pdf, pdf_name, save_pdf

POINTS_PER_MM = 72 / 25.4
SIZES_MM: dict[str, tuple[float, float]] = {
    "a3": (297, 420),
    "a4": (210, 297),
    "a5": (148, 210),
    "a6": (105, 148),
    "letter": (215.9, 279.4),
    "legal": (215.9, 355.6),
    "tabloid": (279.4, 431.8),
}
LAYOUT_SPEC = InputSpec(
    min_files=1, max_files=50, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)
MAX_SHEET_SIDE_MM = 2000.0


def sheet_size(name: str, custom_width: float, custom_height: float) -> tuple[float, float]:
    if name == "custom":
        return custom_width * POINTS_PER_MM, custom_height * POINTS_PER_MM
    width, height = SIZES_MM[name]
    return width * POINTS_PER_MM, height * POINTS_PER_MM


def page_form(target: pikepdf.Pdf, page: pikepdf.Page) -> tuple[pikepdf.Object, float, float, float, float]:
    form = target.copy_foreign(page.as_form_xobject())
    box = [float(value) for value in form.BBox]
    return form, box[0], box[1], box[2] - box[0], box[3] - box[1]


def place_forms(
    target: pikepdf.Pdf,
    sheet: pikepdf.Page,
    placements: list[tuple[pikepdf.Object, float, float, float, float, float, float, float, float]],
) -> None:
    operations: list[str] = []
    xobjects = pikepdf.Dictionary()
    for index, (form, left, bottom, width, height, x, y, cell_w, cell_h) in enumerate(placements):
        scale = min(cell_w / width, cell_h / height) if width and height else 1.0
        tx = x + (cell_w - width * scale) / 2 - left * scale
        ty = y + (cell_h - height * scale) / 2 - bottom * scale
        name = f"Pg{index}"
        xobjects[f"/{name}"] = form
        operations.append(f"q {scale:.6f} 0 0 {scale:.6f} {tx:.4f} {ty:.4f} cm /{name} Do Q")
    sheet.obj.Resources = pikepdf.Dictionary(XObject=xobjects)
    sheet.obj.Contents = target.make_stream("\n".join(operations).encode("ascii"))


class ResizeOptions(ToolOptions):
    size: Literal["a3", "a4", "a5", "a6", "letter", "legal", "tabloid", "custom"] = "a4"
    custom_width_mm: float = Field(default=210, gt=10, le=MAX_SHEET_SIDE_MM)
    custom_height_mm: float = Field(default=297, gt=10, le=MAX_SHEET_SIDE_MM)
    keep_orientation: bool = True
    margin_mm: float = Field(default=0.0, ge=0, le=50)


class ResizePagesTool(Tool[ResizeOptions]):
    slug = "resize-pages"
    name = "Resize pages"
    category = ToolCategory.EDIT
    summary = "Change every page to A4, Letter or a custom size, scaling the content to fit."
    input_spec = LAYOUT_SPEC
    options_schema = ResizeOptions
    seconds_per_page = 0.01

    def run(self, ctx: JobContext[ResizeOptions]) -> list[OutputFile]:
        options = ctx.options
        base_w, base_h = sheet_size(options.size, options.custom_width_mm, options.custom_height_mm)
        margin = options.margin_mm * POINTS_PER_MM

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            with open_pdf(item) as source, pikepdf.new() as result:
                for index, page in enumerate(source.pages):
                    ctx.ensure_not_cancelled()
                    form, left, bottom, width, height = page_form(result, page)
                    sheet_w, sheet_h = base_w, base_h
                    if options.keep_orientation and (width > height) != (sheet_w > sheet_h):
                        sheet_w, sheet_h = sheet_h, sheet_w
                    sheet = result.add_blank_page(page_size=(sheet_w, sheet_h))
                    place_forms(
                        result,
                        sheet,
                        [
                            (
                                form,
                                left,
                                bottom,
                                width,
                                height,
                                margin,
                                margin,
                                sheet_w - 2 * margin,
                                sheet_h - 2 * margin,
                            )
                        ],
                    )
                    ctx.report(index / len(source.pages), "Resizing pages")
                copy_document_info(source, result)
                target = ctx.output_path(pdf_name(f"{item.stem}-resized", "resized"))
                save_pdf(result, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Resizing file")


GRIDS = {2: (2, 1), 4: (2, 2), 6: (3, 2), 9: (3, 3), 16: (4, 4)}


class NUpOptions(ToolOptions):
    mode: Literal["nup", "booklet"] = "nup"
    per_sheet: Literal[2, 4, 6, 9, 16] = 4
    size: Literal["a3", "a4", "a5", "letter", "legal", "tabloid"] = "a4"
    margin_mm: float = Field(default=8.0, ge=0, le=40)
    gap_mm: float = Field(default=4.0, ge=0, le=40)
    border: bool = False

    @model_validator(mode="after")
    def _booklet_uses_two_up(self) -> "NUpOptions":
        return self


def border_content(rects: list[tuple[float, float, float, float]]) -> str:
    return "\n".join(f"q 0.6 w 0.5 G {x:.3f} {y:.3f} {w:.3f} {h:.3f} re S Q" for x, y, w, h in rects)


class NUpBookletTool(Tool[NUpOptions]):
    slug = "n-up"
    name = "N-up and booklet"
    category = ToolCategory.EDIT
    summary = "Put several pages on one sheet, or arrange pages as a printable booklet."
    input_spec = LAYOUT_SPEC
    options_schema = NUpOptions
    seconds_per_page = 0.012

    def run(self, ctx: JobContext[NUpOptions]) -> list[OutputFile]:
        options = ctx.options
        width, height = sheet_size(options.size, 0, 0)
        margin = options.margin_mm * POINTS_PER_MM
        gap = options.gap_mm * POINTS_PER_MM

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            with open_pdf(item) as source, pikepdf.new() as result:
                count = len(source.pages)
                if count < 1:
                    raise ToolInputError("This document has no pages.")
                if options.mode == "booklet":
                    padded = count + (-count) % 4
                    order: list[int | None] = []
                    for sheet_index in range(padded // 4):
                        first, last = 2 * sheet_index, padded - 1 - 2 * sheet_index
                        order.extend([last, first, first + 1, last - 1])
                    slots = [(i if i is not None and i < count else None) for i in order]
                    columns, rows, per_sheet = 2, 1, 2
                    sheet_w, sheet_h = max(width, height), min(width, height)
                else:
                    slots = list(range(count))
                    columns, rows = GRIDS[options.per_sheet]
                    per_sheet = options.per_sheet
                    sheet_w, sheet_h = (
                        (max(width, height), min(width, height))
                        if columns > rows
                        else (min(width, height), max(width, height))
                    )
                cell_w = (sheet_w - 2 * margin - gap * (columns - 1)) / columns
                cell_h = (sheet_h - 2 * margin - gap * (rows - 1)) / rows
                for start in range(0, len(slots), per_sheet):
                    ctx.ensure_not_cancelled()
                    ctx.report(start / len(slots), "Arranging pages")
                    sheet = result.add_blank_page(page_size=(sheet_w, sheet_h))
                    placements = []
                    rects = []
                    for position, source_index in enumerate(slots[start : start + per_sheet]):
                        column, row = position % columns, position // columns
                        x = margin + column * (cell_w + gap)
                        y = sheet_h - margin - (row + 1) * cell_h - row * gap
                        rects.append((x, y, cell_w, cell_h))
                        if source_index is None:
                            continue
                        form, left, bottom, form_w, form_h = page_form(result, source.pages[source_index])
                        placements.append((form, left, bottom, form_w, form_h, x, y, cell_w, cell_h))
                    place_forms(result, sheet, placements)
                    if options.border:
                        extra = border_content(rects).encode("ascii")
                        sheet.contents_add(pikepdf.Stream(result, extra), prepend=False)
                copy_document_info(source, result)
                suffix = "booklet" if options.mode == "booklet" else f"{per_sheet}-up"
                target = ctx.output_path(pdf_name(f"{item.stem}-{suffix}", suffix))
                save_pdf(result, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Arranging file")
