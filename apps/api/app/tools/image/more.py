import math
import re
from collections.abc import Sequence
from functools import lru_cache
from typing import Any, Literal

from PIL import Image, ImageColor, ImageDraw, ImageFont
from pydantic import Field

from app.core.errors import ToolInputError
from app.text.bidi import paragraph_is_rtl
from app.text.fonts import FontKey, face_for
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
from app.tools.image.images import (
    IMAGE_SPEC,
    ImageFormat,
    editable_format,
    load,
    save_image,
)

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
Position = Literal[
    "top_left",
    "top_center",
    "top_right",
    "middle_left",
    "center",
    "middle_right",
    "bottom_left",
    "bottom_center",
    "bottom_right",
]
GRID: dict[str, tuple[float, float]] = {
    "top_left": (0.0, 0.0),
    "top_center": (0.5, 0.0),
    "top_right": (1.0, 0.0),
    "middle_left": (0.0, 0.5),
    "center": (0.5, 0.5),
    "middle_right": (1.0, 0.5),
    "bottom_left": (0.0, 1.0),
    "bottom_center": (0.5, 1.0),
    "bottom_right": (1.0, 1.0),
}
REMBG_MODELS = {"fast": "u2netp", "quality": "u2net"}


def parse_color(value: str) -> tuple[int, int, int]:
    if not HEX_COLOR.match(value):
        raise ToolInputError("Colours must look like #RRGGBB.")
    red, green, blue = ImageColor.getrgb(value)[:3]
    return red, green, blue


@lru_cache(maxsize=16)
def font_for(text: str, key: FontKey, bold: bool, size: int) -> ImageFont.FreeTypeFont:
    face = face_for(text, key, bold, paragraph_is_rtl(text))
    return ImageFont.truetype(str(face.path), size, layout_engine=ImageFont.Layout.RAQM)


def text_layer(
    text: str, key: FontKey, bold: bool, size: int, color: tuple[int, int, int], opacity: float
) -> Image.Image:
    font = font_for(text, key, bold, size)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    box = probe.multiline_textbbox((0, 0), text, font=font, spacing=size // 5)
    left, top, right, bottom = (round(value) for value in box)
    pad = max(2, size // 8)
    layer = Image.new("RGBA", (right - left + 2 * pad, bottom - top + 2 * pad), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    alpha = round(255 * opacity)
    draw.multiline_text((pad - left, pad - top), text, font=font, fill=(*color, alpha), spacing=size // 5)
    return layer


def anchor_xy(base: tuple[int, int], layer: tuple[int, int], position: str, margin: int) -> tuple[int, int]:
    fx, fy = GRID[position]
    x = margin + fx * (base[0] - layer[0] - 2 * margin)
    y = margin + fy * (base[1] - layer[1] - 2 * margin)
    return round(x), round(y)


def composite(base: Image.Image, layer: Image.Image, xy: tuple[int, int]) -> Image.Image:
    rgba = base.convert("RGBA")
    rgba.alpha_composite(layer, (max(xy[0], 0), max(xy[1], 0)))
    return rgba


def finish(
    ctx: JobContext[Any], image: Image.Image, item: InputFile, suffix: str, original_alpha: bool
) -> OutputFile:
    fmt: ImageFormat = editable_format(item)
    if fmt in {"tiff", "bmp", "gif"}:
        fmt = "png"
    if fmt == "jpg" and original_alpha:
        fmt = "png"
    return save_image(ctx, image, item, fmt, suffix)


@lru_cache(maxsize=2)
def background_session(model: str) -> Any:
    from rembg import new_session

    return new_session(model)


class RemoveBackgroundOptions(ToolOptions):
    model: Literal["fast", "quality"] = "fast"
    background: Literal["transparent", "white", "color"] = "transparent"
    color: str = "#ffffff"


class ImageRemoveBackgroundTool(Tool[RemoveBackgroundOptions]):
    slug = "image-remove-background"
    name = "Remove background"
    category = ToolCategory.IMAGE
    summary = "Cut out the subject of a photo and make the background transparent or a solid colour."
    input_spec = IMAGE_SPEC
    options_schema = RemoveBackgroundOptions
    seconds_per_mb = 3.0
    limit_address_space = False

    def run(self, ctx: JobContext[RemoveBackgroundOptions]) -> list[OutputFile]:
        options = ctx.options
        fill = parse_color(options.color) if options.background == "color" else (255, 255, 255)

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            from rembg import remove

            image = load(item).convert("RGB")
            try:
                session = background_session(REMBG_MODELS[options.model])
                cut = remove(image, session=session)
            except Exception as exc:
                raise ToolFailedError(
                    "The background removal model is not available on this server.", code="model_missing"
                ) from exc
            if options.background != "transparent":
                flat = Image.new("RGB", cut.size, fill)
                flat.paste(cut, mask=cut.getchannel("A"))
                cut = flat
            target = ctx.output_path(f"{item.stem}-no-background.png")
            cut.save(target, format="PNG", optimize=True)
            return [OutputFile(path=target, filename=target.name, mime_type="image/png")]

        return run_each(ctx, handle, "Removing background")


class ImageWatermarkOptions(ToolOptions):
    kind: Literal["text", "logo"] = "text"
    text: str = Field(default="CONFIDENTIAL", max_length=200)
    font: FontKey = "noto-sans"
    bold: bool = True
    size_percent: float = Field(default=6.0, ge=1, le=100)
    opacity: float = Field(default=0.4, ge=0.05, le=1)
    color: str = "#ffffff"
    position: Position = "center"
    rotation: float = Field(default=0.0, ge=-180, le=180)
    tile: bool = False
    margin_percent: float = Field(default=2.0, ge=0, le=20)


def rotated(layer: Image.Image, degrees: float) -> Image.Image:
    if not degrees:
        return layer
    return layer.rotate(degrees, resample=Image.Resampling.BICUBIC, expand=True)


class ImageWatermarkTool(Tool[ImageWatermarkOptions]):
    slug = "image-watermark"
    name = "Watermark image"
    category = ToolCategory.IMAGE
    summary = "Stamp text or a logo onto images. For a logo, upload it last."
    input_spec = IMAGE_SPEC
    options_schema = ImageWatermarkOptions
    seconds_per_mb = 0.4

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: ImageWatermarkOptions
    ) -> None:
        if options.kind == "logo" and len(files) < 2:
            raise ToolInputError("Upload the images first and the logo last.")
        if options.kind == "text" and not options.text.strip():
            raise ToolInputError("Enter the watermark text.")
        parse_color(options.color)

    def run(self, ctx: JobContext[ImageWatermarkOptions]) -> list[OutputFile]:
        options = ctx.options
        color = parse_color(options.color)
        logo: Image.Image | None = None
        targets = list(ctx.inputs)
        if options.kind == "logo":
            logo = load(targets.pop()).convert("RGBA")
        outputs: list[OutputFile] = []
        for index, item in enumerate(targets):
            ctx.ensure_not_cancelled()
            ctx.report(index / len(targets), f"Watermarking image {index + 1} of {len(targets)}")
            base = load(item)
            has_alpha = "A" in base.getbands()
            side = min(base.size)
            if logo is not None:
                width = max(8, round(base.width * options.size_percent / 100 * 3))
                layer = logo.resize((width, max(1, round(logo.height * width / logo.width))))
                alpha = layer.getchannel("A").point(lambda value: round(value * options.opacity))
                layer.putalpha(alpha)
            else:
                layer = text_layer(
                    options.text,
                    options.font,
                    options.bold,
                    max(8, round(side * options.size_percent / 100)),
                    color,
                    options.opacity,
                )
            layer = rotated(layer, options.rotation)
            margin = round(side * options.margin_percent / 100)
            canvas = base.convert("RGBA")
            if options.tile:
                step_x, step_y = round(layer.width * 1.6), round(layer.height * 2.2)
                for row, y in enumerate(range(0, base.height, step_y)):
                    offset = step_x // 2 if row % 2 else 0
                    for x in range(offset, base.width, step_x):
                        canvas.alpha_composite(layer, (x, y))
            else:
                x, y = anchor_xy(base.size, layer.size, options.position, margin)
                canvas = composite(canvas, layer, (x, y))
            outputs.append(finish(ctx, canvas, item, "watermarked", has_alpha))
        ctx.report(1.0, "Packaging")
        return outputs


class ImageAddTextOptions(ToolOptions):
    text: str = Field(default="Your text", min_length=1, max_length=1000)
    font: FontKey = "noto-sans"
    bold: bool = False
    size_percent: float = Field(default=6.0, ge=1, le=100)
    color: str = "#ffffff"
    opacity: float = Field(default=1.0, ge=0.05, le=1)
    position: Position = "bottom_center"
    box: bool = True
    box_color: str = "#000000"
    box_opacity: float = Field(default=0.5, ge=0, le=1)
    margin_percent: float = Field(default=3.0, ge=0, le=30)


class ImageAddTextTool(Tool[ImageAddTextOptions]):
    slug = "image-add-text"
    name = "Add text to image"
    category = ToolCategory.IMAGE
    summary = "Put a caption or title on an image, in English or Urdu, with an optional backing box."
    input_spec = IMAGE_SPEC
    options_schema = ImageAddTextOptions
    seconds_per_mb = 0.4

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: ImageAddTextOptions
    ) -> None:
        parse_color(options.color)
        parse_color(options.box_color)

    def run(self, ctx: JobContext[ImageAddTextOptions]) -> list[OutputFile]:
        options = ctx.options
        color = parse_color(options.color)
        box_color = parse_color(options.box_color)

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            base = load(item)
            has_alpha = "A" in base.getbands()
            side = min(base.size)
            size = max(8, round(side * options.size_percent / 100))
            layer = text_layer(options.text, options.font, options.bold, size, color, options.opacity)
            if options.box:
                pad = size // 3
                backing = Image.new(
                    "RGBA",
                    (layer.width + 2 * pad, layer.height + 2 * pad),
                    (*box_color, round(255 * options.box_opacity)),
                )
                backing.alpha_composite(layer, (pad, pad))
                layer = backing
            if layer.width > base.width:
                ratio = base.width / layer.width
                layer = layer.resize((base.width, max(1, math.floor(layer.height * ratio))))
            margin = round(side * options.margin_percent / 100)
            xy = anchor_xy(base.size, layer.size, options.position, margin)
            return [finish(ctx, composite(base, layer, xy), item, "text", has_alpha)]

        return run_each(ctx, handle, "Adding text")
