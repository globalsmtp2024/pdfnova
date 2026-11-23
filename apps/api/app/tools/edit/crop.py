from collections.abc import Sequence
from typing import Any, Literal

import pikepdf
from pydantic import Field, model_validator

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
)
from app.tools.batch import run_each
from app.tools.edit.crop_math import (
    Box,
    CropGeometryError,
    Margins,
    crop_box,
    display_size,
    intersect,
    normalize_box,
    normalize_rotation,
    pixel_bounds_to_margins,
)
from app.tools.pages import parse_page_ranges, parse_page_set
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

CropMode = Literal["visual", "permanent"]
PAGE_BOX_KEYS = ("/MediaBox", "/CropBox", "/TrimBox", "/BleedBox", "/ArtBox")
AUTO_RENDER_SCALE = 0.5
AUTO_INK_THRESHOLD = 240
MAX_PAGE_POINTS = 14400.0


class CropMargins(ToolOptions):
    top: float = Field(default=0, ge=0, le=MAX_PAGE_POINTS)
    right: float = Field(default=0, ge=0, le=MAX_PAGE_POINTS)
    bottom: float = Field(default=0, ge=0, le=MAX_PAGE_POINTS)
    left: float = Field(default=0, ge=0, le=MAX_PAGE_POINTS)

    def as_margins(self) -> Margins:
        return Margins(top=self.top, right=self.right, bottom=self.bottom, left=self.left)


class CropOptions(ToolOptions):
    mode: CropMode = "visual"
    margins: CropMargins = Field(default_factory=CropMargins)
    auto: bool = False
    padding: float = Field(default=6, ge=0, le=144)
    pages: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _something_to_crop(self) -> "CropOptions":
        margins = self.margins
        if not self.auto and not any((margins.top, margins.right, margins.bottom, margins.left)):
            raise ValueError("Move the crop edges or enter margins before cropping.")
        return self


def _floats(array: Any) -> list[float]:
    return [float(array[position]) for position in range(len(array))]


def page_box(page: pikepdf.Page) -> Box:
    media = normalize_box(_floats(page.mediabox))
    crop = normalize_box(_floats(page.cropbox))
    return intersect(media, crop)


def page_rotation(page: pikepdf.Page) -> int:
    value: Any = page.obj.get("/Rotate")
    try:
        return normalize_rotation(int(value) if value is not None else 0)
    except CropGeometryError:
        return 0


def content_margins(document: Any, index: int, box: Box, rotation: int, padding: float) -> Margins | None:
    from PIL import ImageOps

    page = document[index]
    try:
        image = page.render(scale=AUTO_RENDER_SCALE, may_draw_forms=True).to_pil().convert("L")
    finally:
        page.close()
    mask = ImageOps.invert(image).point(lambda value: 255 if value > 255 - AUTO_INK_THRESHOLD else 0)
    bounds = mask.getbbox()
    if bounds is None:
        return None
    return pixel_bounds_to_margins(bounds, image.size, display_size(box, rotation), padding)


def _overlaps(rect: Box, box: Box) -> bool:
    return rect.x0 < box.x1 and rect.x1 > box.x0 and rect.y0 < box.y1 and rect.y1 > box.y0


def drop_outside_annotations(page: pikepdf.Page, box: Box) -> int:
    annots: Any = page.obj.get("/Annots")
    if not isinstance(annots, pikepdf.Array):
        return 0
    removed: list[tuple[int, int]] = []
    kept: list[Any] = []
    for position in range(len(annots)):
        annot: Any = annots[position]
        if not isinstance(annot, pikepdf.Dictionary):
            kept.append(annot)
            continue
        rect_value: Any = annot.get("/Rect")
        is_widget = annot.get("/Subtype") == pikepdf.Name.Widget
        try:
            rect = normalize_box([float(value) for value in rect_value]) if rect_value is not None else None
        except (CropGeometryError, TypeError, ValueError):
            rect = None
        if rect is not None and not is_widget and not _overlaps(rect, box):
            if annot.is_indirect:
                removed.append(annot.objgen)
            continue
        kept.append(annot)
    orphaned = {
        annot.objgen
        for annot in kept
        if isinstance(annot, pikepdf.Dictionary)
        and annot.get("/Subtype") == pikepdf.Name.Popup
        and isinstance(annot.get("/Parent"), pikepdf.Dictionary)
        and annot.Parent.objgen in removed
    }
    final = [
        annot for annot in kept if not (isinstance(annot, pikepdf.Dictionary) and annot.objgen in orphaned)
    ]
    page.obj.Annots = pikepdf.Array(final)
    return len(annots) - len(final)


def _number(value: float) -> str:
    return f"{value:.4f}".rstrip("0").rstrip(".")


def apply_crop(pdf: pikepdf.Pdf, page: pikepdf.Page, box: Box, mode: CropMode) -> None:
    array = pikepdf.Array(box.as_list())
    if mode == "visual":
        page.obj.CropBox = array
        return
    for key in PAGE_BOX_KEYS:
        page.obj[key] = pikepdf.Array(box.as_list())
    clip = f"q {_number(box.x0)} {_number(box.y0)} {_number(box.width)} {_number(box.height)} re W n\n"
    page.contents_add(pikepdf.Stream(pdf, clip.encode("ascii")), prepend=True)
    page.contents_add(pikepdf.Stream(pdf, b"\nQ\n"), prepend=False)
    drop_outside_annotations(page, box)


class CropTool(Tool[CropOptions]):
    slug = "crop"
    name = "Crop PDF"
    category = ToolCategory.EDIT
    summary = "Trim page margins visually or permanently, on every page or the pages you choose."
    input_spec = InputSpec(
        min_files=1, max_files=50, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = CropOptions
    seconds_per_page = 0.01

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: CropOptions) -> None:
        for info in files:
            if info.page_count is not None:
                parse_page_ranges(options.pages, info.page_count)

    def run(self, ctx: JobContext[CropOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            with open_pdf(item) as pdf:
                targets = parse_page_set(options.pages, len(pdf.pages))
                document = self._open_render(item) if options.auto else None
                try:
                    for position, index in enumerate(targets):
                        if position % 20 == 0:
                            ctx.ensure_not_cancelled()
                        self._crop_page(pdf, index, document, options)
                finally:
                    if document is not None:
                        document.close()
                target = ctx.output_path(pdf_name(f"{item.stem}-cropped", "cropped"))
                save_pdf(pdf, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Cropping file")

    def _open_render(self, item: InputFile) -> Any:
        import pypdfium2 as pdfium

        try:
            return pdfium.PdfDocument(str(item.path), password=item.password)
        except pdfium.PdfiumError as exc:
            raise ToolInputError("This PDF couldn't be rendered to find its content.") from exc

    def _crop_page(self, pdf: pikepdf.Pdf, index: int, document: Any, options: CropOptions) -> None:
        page = pdf.pages[index]
        try:
            box = page_box(page)
        except CropGeometryError as exc:
            raise ToolInputError(f"Page {index + 1} has no visible area to crop.") from exc
        rotation = page_rotation(page)
        if document is not None:
            margins = content_margins(document, index, box, rotation, options.padding)
            if margins is None:
                return
        else:
            margins = options.margins.as_margins()
        try:
            result = crop_box(box, margins, rotation)
        except CropGeometryError as exc:
            raise ToolInputError(
                f"The crop area is empty on page {index + 1}.",
                hint="Make the margins smaller than the page.",
            ) from exc
        apply_crop(pdf, page, result, options.mode)
