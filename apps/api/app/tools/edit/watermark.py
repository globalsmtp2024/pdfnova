from collections.abc import Sequence
from typing import Literal

import pikepdf
from pydantic import ConfigDict, Field, field_validator, model_validator

from app.core.errors import ToolInputError
from app.text.bidi import Direction
from app.text.fonts import FontKey
from app.text.geometry import (
    Anchor,
    PageGeometry,
    anchor_center,
    page_geometry,
    rotated_extent,
    stamp_matrix,
    tile_centers,
    visual_matrix,
)
from app.text.images import check_image, decode_image_data, prepare_image
from app.text.overlay import Layer, OverlayDocument, PreparedImage, Stamp, TextStyle, parse_hex_color
from app.tools.base import InputFile, InputFileInfo, JobContext, OutputFile, Tool, ToolCategory, ToolOptions
from app.tools.edit.stamping import (
    NOTHING_HINT,
    NOTHING_SELECTED,
    STAMP_SPEC,
    Parity,
    check_expression,
    checked_color,
    select_pages,
    stamp_each,
)

MAX_TILES = 2500


class WatermarkOptions(ToolOptions):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    mode: Literal["text", "image"] = "text"
    text: str = Field(default="CONFIDENTIAL", max_length=1000)
    font: FontKey = "noto-sans"
    size: float = Field(default=48, ge=4, le=1000)
    bold: bool = True
    color: str = Field(default="#C62828", max_length=9)
    direction: Direction = "auto"
    image_data: str | None = Field(default=None, max_length=14_000_000, repr=False)
    image_scale: float = Field(default=40, ge=1, le=100)
    opacity: float = Field(default=0.3, ge=0.0, le=1.0)
    rotation: float = Field(default=45, ge=-360, le=360)
    position: Anchor = "middle-center"
    margin: float = Field(default=36, ge=0, le=2000)
    offset_x: float = Field(default=0, ge=-5000, le=5000)
    offset_y: float = Field(default=0, ge=-5000, le=5000)
    layout: Literal["single", "tiled"] = "single"
    spacing: float = Field(default=72, ge=0, le=5000)
    layer: Layer = "over"
    pages: str | None = Field(default=None, max_length=2000)
    parity: Parity = "all"
    skip_first: bool = False

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        return checked_color(value.strip())

    @model_validator(mode="after")
    def _content(self) -> "WatermarkOptions":
        if self.mode == "text":
            self.text = "\n".join(line.strip() for line in self.text.replace("\r\n", "\n").split("\n"))
            self.text = self.text.strip("\n")
            if not self.text.strip():
                raise ValueError("Enter the watermark text.")
        elif not self.image_data:
            raise ValueError("Choose a PNG or JPG image for the watermark.")
        return self


def _targets(options: WatermarkOptions, count: int) -> list[int]:
    return select_pages(count, options.pages, options.parity, skip_first=1 if options.skip_first else 0)


def _visual_stamp(
    overlay: OverlayDocument,
    options: WatermarkOptions,
    geometry: PageGeometry,
    image: PreparedImage | None,
    style: TextStyle,
) -> Stamp:
    if image is not None:
        width = geometry.visual_width * options.image_scale / 100
        height = width * image.height / image.width
        return overlay.image_stamp(image, width, height, options.opacity)
    return overlay.text_stamp(options.text, style)


def apply_watermark(
    pdf: pikepdf.Pdf, overlay: OverlayDocument, options: WatermarkOptions, image: PreparedImage | None
) -> int:
    style = TextStyle(
        font=options.font,
        size=options.size,
        color=parse_hex_color(options.color),
        opacity=options.opacity,
        bold=options.bold,
        direction=options.direction,
    )
    targets = _targets(options, len(pdf.pages))
    for index in targets:
        page = pdf.pages[index]
        geometry = page_geometry(page)
        stamp = _visual_stamp(overlay, options, geometry, image, style)
        visual_w, visual_h = geometry.visual_width, geometry.visual_height
        if options.layout == "tiled":
            key = ("tiles", round(visual_w, 3), round(visual_h, 3), id(stamp))
            placements = [
                (stamp, visual_matrix(center, stamp.width, stamp.height, options.rotation))
                for center in tile_centers(
                    visual_w,
                    visual_h,
                    stamp.width,
                    stamp.height,
                    options.rotation,
                    options.spacing,
                    MAX_TILES,
                )
            ]
            group = overlay.group(key, visual_w, visual_h, placements)
            overlay.place(page, group, geometry.visual_to_user(), options.layer)
            continue
        extent_w, extent_h = rotated_extent(stamp.width, stamp.height, options.rotation)
        center = anchor_center(
            options.position,
            visual_w,
            visual_h,
            extent_w,
            extent_h,
            options.margin,
            options.margin,
            options.offset_x,
            options.offset_y,
        )
        overlay.place(
            page,
            stamp,
            stamp_matrix(geometry, center, stamp.width, stamp.height, options.rotation),
            options.layer,
        )
    return len(targets)


class WatermarkTool(Tool[WatermarkOptions]):
    slug = "watermark"
    name = "Add watermark"
    category = ToolCategory.EDIT
    summary = "Stamp text or an image over or under your pages, once or tiled, in any language."
    input_spec = STAMP_SPEC
    options_schema = WatermarkOptions
    seconds_per_page = 0.004

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: WatermarkOptions
    ) -> None:
        check_expression(files, options.pages)
        for info in files:
            if info.page_count is not None and not _targets(options, info.page_count):
                raise ToolInputError(NOTHING_SELECTED, hint=NOTHING_HINT)
        if options.mode == "image" and options.image_data:
            check_image(decode_image_data(options.image_data))

    def run(self, ctx: JobContext[WatermarkOptions]) -> list[OutputFile]:
        options = ctx.options
        image = (
            prepare_image(decode_image_data(options.image_data))
            if options.mode == "image" and options.image_data
            else None
        )

        def stamper(pdf: pikepdf.Pdf, overlay: OverlayDocument, _: InputFile) -> int:
            return apply_watermark(pdf, overlay, options, image)

        return stamp_each(ctx, stamper, "watermarked", "Watermarking file")
