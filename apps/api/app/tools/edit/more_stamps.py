from collections.abc import Sequence
from datetime import date
from typing import Literal

import pikepdf
from pydantic import Field, field_validator

from app.core.errors import ToolInputError
from app.text.bidi import Direction
from app.text.fonts import FontKey
from app.text.geometry import Anchor, anchor_center, page_geometry, stamp_matrix
from app.text.images import decode_image_data, prepare_image
from app.text.overlay import OverlayDocument, TextStyle, parse_hex_color
from app.tools.base import InputFile, InputFileInfo, JobContext, OutputFile, Tool, ToolCategory, ToolOptions
from app.tools.edit.stamping import (
    POINTS_PER_MM,
    STAMP_SPEC,
    Parity,
    check_expression,
    checked_color,
    select_pages,
    stamp_each,
)

HEADER_FOOTER_SLOTS: tuple[tuple[str, Anchor], ...] = (
    ("header_left", "top-left"),
    ("header_center", "top-center"),
    ("header_right", "top-right"),
    ("footer_left", "bottom-left"),
    ("footer_center", "bottom-center"),
    ("footer_right", "bottom-right"),
)


class HeaderFooterOptions(ToolOptions):
    header_left: str = Field(default="", max_length=300)
    header_center: str = Field(default="", max_length=300)
    header_right: str = Field(default="", max_length=300)
    footer_left: str = Field(default="", max_length=300)
    footer_center: str = Field(default="", max_length=300)
    footer_right: str = Field(default="{n} / {total}", max_length=300)
    font: FontKey = "noto-sans"
    size: float = Field(default=10.0, ge=4, le=72)
    color: str = "#333333"
    opacity: float = Field(default=1.0, ge=0.05, le=1.0)
    margin_mm: float = Field(default=12.0, ge=0, le=100)
    direction: Direction = "auto"
    pages: str | None = Field(default=None, max_length=2000)
    parity: Parity = "all"
    skip_first: int = Field(default=0, ge=0, le=100000)

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        return checked_color(value)

    def slots(self) -> list[tuple[str, Anchor]]:
        return [(getattr(self, name), anchor) for name, anchor in HEADER_FOOTER_SLOTS if getattr(self, name)]


def render_tokens(template: str, number: int, total: int, today: str) -> str:
    return (
        template.replace("{n}", str(number)).replace("{total}", str(total)).replace("{date}", today)
    )


def apply_header_footer(pdf: pikepdf.Pdf, overlay: OverlayDocument, options: HeaderFooterOptions) -> int:
    slots = options.slots()
    if not slots:
        raise ToolInputError("Add text to at least one header or footer position.")
    style = TextStyle(
        font=options.font,
        size=options.size,
        color=parse_hex_color(options.color),
        opacity=options.opacity,
        direction=options.direction,
    )
    margin = options.margin_mm * POINTS_PER_MM
    count = len(pdf.pages)
    today = date.today().isoformat()
    chosen = select_pages(count, options.pages, options.parity, 1, options.skip_first, 0)
    for index in chosen:
        page = pdf.pages[index]
        geometry = page_geometry(page)
        for template, anchor in slots:
            stamp = overlay.text_stamp(render_tokens(template, index + 1, count, today), style)
            center = anchor_center(
                anchor, geometry.visual_width, geometry.visual_height, stamp.width, stamp.height, margin, margin
            )
            overlay.place(page, stamp, stamp_matrix(geometry, center, stamp.width, stamp.height, 0.0))
    return len(chosen)


class HeaderFooterTool(Tool[HeaderFooterOptions]):
    slug = "header-footer"
    name = "Headers and footers"
    category = ToolCategory.EDIT
    summary = "Add running headers and footers with page numbers, dates and your own text."
    input_spec = STAMP_SPEC
    options_schema = HeaderFooterOptions
    seconds_per_page = 0.005

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: HeaderFooterOptions
    ) -> None:
        check_expression(files, options.pages)

    def run(self, ctx: JobContext[HeaderFooterOptions]) -> list[OutputFile]:
        options = ctx.options

        def stamper(pdf: pikepdf.Pdf, overlay: OverlayDocument, _: InputFile) -> int:
            return apply_header_footer(pdf, overlay, options)

        return stamp_each(ctx, stamper, "header-footer", "Adding headers and footers")


class BatesOptions(ToolOptions):
    prefix: str = Field(default="", max_length=40)
    suffix: str = Field(default="", max_length=40)
    start: int = Field(default=1, ge=0, le=999_999_999)
    digits: int = Field(default=6, ge=1, le=12)
    position: Anchor = "bottom-right"
    font: FontKey = "noto-sans-mono"
    size: float = Field(default=9.0, ge=4, le=48)
    color: str = "#000000"
    margin_mm: float = Field(default=10.0, ge=0, le=100)
    continue_across_files: bool = True
    pages: str | None = Field(default=None, max_length=2000)

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        return checked_color(value)


class BatesNumberingTool(Tool[BatesOptions]):
    slug = "bates-numbering"
    name = "Bates numbering"
    category = ToolCategory.EDIT
    summary = "Stamp unique, sequential identifiers on every page, across multiple files."
    input_spec = STAMP_SPEC
    options_schema = BatesOptions
    seconds_per_page = 0.005

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: BatesOptions) -> None:
        check_expression(files, options.pages)

    def run(self, ctx: JobContext[BatesOptions]) -> list[OutputFile]:
        options = ctx.options
        counter = options.start
        style = TextStyle(
            font=options.font, size=options.size, color=parse_hex_color(options.color), align="right"
        )
        margin = options.margin_mm * POINTS_PER_MM

        def stamper(pdf: pikepdf.Pdf, overlay: OverlayDocument, _: InputFile) -> int:
            nonlocal counter
            if not options.continue_across_files:
                counter = options.start
            chosen = select_pages(len(pdf.pages), options.pages, "all")
            for index in chosen:
                page = pdf.pages[index]
                label = f"{options.prefix}{counter:0{options.digits}d}{options.suffix}"
                counter += 1
                stamp = overlay.text_stamp(label, style)
                geometry = page_geometry(page)
                center = anchor_center(
                    options.position,
                    geometry.visual_width,
                    geometry.visual_height,
                    stamp.width,
                    stamp.height,
                    margin,
                    margin,
                )
                overlay.place(page, stamp, stamp_matrix(geometry, center, stamp.width, stamp.height, 0.0))
            return len(chosen)

        return stamp_each(ctx, stamper, "bates", "Numbering file")


class BackgroundOptions(ToolOptions):
    mode: Literal["color", "image"] = "color"
    color: str = "#FFF8DC"
    image_data: str | None = Field(default=None, max_length=8_000_000)
    opacity: float = Field(default=1.0, ge=0.05, le=1.0)
    pages: str | None = Field(default=None, max_length=2000)
    parity: Parity = "all"

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        return checked_color(value)


class BackgroundTool(Tool[BackgroundOptions]):
    slug = "background"
    name = "Background"
    category = ToolCategory.EDIT
    summary = "Add a solid colour or an image behind the content of every page."
    input_spec = STAMP_SPEC
    options_schema = BackgroundOptions
    seconds_per_page = 0.004

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: BackgroundOptions
    ) -> None:
        check_expression(files, options.pages)
        if options.mode == "image" and not options.image_data:
            raise ToolInputError("Choose an image to use as the background.")

    def run(self, ctx: JobContext[BackgroundOptions]) -> list[OutputFile]:
        options = ctx.options
        prepared = prepare_image(decode_image_data(options.image_data)) if options.mode == "image" and options.image_data else None
        red, green, blue = parse_hex_color(options.color)

        def stamper(pdf: pikepdf.Pdf, overlay: OverlayDocument, _: InputFile) -> int:
            chosen = select_pages(len(pdf.pages), options.pages, options.parity)
            for index in chosen:
                page = pdf.pages[index]
                geometry = page_geometry(page)
                if prepared is not None:
                    stamp = overlay.image_stamp(
                        prepared, geometry.visual_width, geometry.visual_height, options.opacity
                    )
                    center = (geometry.visual_width / 2, geometry.visual_height / 2)
                    overlay.place(
                        page,
                        stamp,
                        stamp_matrix(geometry, center, stamp.width, stamp.height, 0.0),
                        "under",
                    )
                else:
                    box = [float(value) for value in page.cropbox]
                    fill = (
                        f"q /GSBg gs {red:.4f} {green:.4f} {blue:.4f} rg "
                        f"{box[0]:.3f} {box[1]:.3f} {box[2] - box[0]:.3f} {box[3] - box[1]:.3f} re f Q\n"
                    )
                    state = pikepdf.Dictionary(Type=pikepdf.Name.ExtGState, ca=options.opacity)
                    resources = page.obj.get("/Resources")
                    if resources is None:
                        page.obj.Resources = pikepdf.Dictionary()
                        resources = page.obj.Resources
                    gstates = resources.get("/ExtGState")
                    if gstates is None:
                        resources.ExtGState = pikepdf.Dictionary()
                        gstates = resources.ExtGState
                    gstates["/GSBg"] = pdf.make_indirect(state)
                    page.contents_add(pikepdf.Stream(pdf, fill.encode("ascii")), prepend=True)
            return len(chosen)

        return stamp_each(ctx, stamper, "background", "Adding background")

