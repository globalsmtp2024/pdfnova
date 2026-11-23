from pathlib import Path
from typing import Literal

from PIL import Image, ImageOps
from pydantic import Field

from app.core.errors import ToolInputError
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

MAX_PIXELS = 200_000_000
MAX_SIDE = 20000
IMAGE_SPEC = InputSpec(min_files=1, max_files=100, accepted_kinds=frozenset({FileKind.IMAGE}))
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
ImageFormat = Literal["jpg", "png", "webp", "tiff", "bmp", "gif"]
FORMATS: dict[str, tuple[str, str, str]] = {
    "jpg": ("JPEG", "image/jpeg", "jpg"),
    "png": ("PNG", "image/png", "png"),
    "webp": ("WEBP", "image/webp", "webp"),
    "tiff": ("TIFF", "image/tiff", "tif"),
    "bmp": ("BMP", "image/bmp", "bmp"),
    "gif": ("GIF", "image/gif", "gif"),
}
EXTENSION_FORMAT: dict[str, ImageFormat] = {
    "jpg": "jpg",
    "jpeg": "jpg",
    "png": "png",
    "webp": "webp",
    "tif": "tiff",
    "tiff": "tiff",
    "bmp": "bmp",
    "gif": "gif",
}
ASPECTS = {"1:1": 1.0, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9, "3:4": 3 / 4, "2:3": 2 / 3, "9:16": 9 / 16}


def load(item: InputFile) -> Image.Image:
    try:
        with Image.open(item.path) as source:
            if source.width * source.height > MAX_PIXELS:
                raise ToolInputError("This image is too large to process safely.")
            return ImageOps.exif_transpose(source.copy())
    except (OSError, Image.DecompressionBombError, ValueError) as exc:
        raise ToolFailedError("This image could not be read.", code="image_unreadable") from exc


def source_format(item: InputFile) -> ImageFormat:
    suffix = Path(item.original_name).suffix.lower().lstrip(".")
    return EXTENSION_FORMAT.get(suffix, "png")


def editable_format(item: InputFile) -> ImageFormat:
    fmt = source_format(item)
    return "png" if fmt == "gif" else fmt


def has_alpha(image: Image.Image) -> bool:
    return image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info)


def prepared(image: Image.Image, fmt: ImageFormat) -> Image.Image:
    if fmt in {"jpg", "bmp"}:
        if has_alpha(image):
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.getchannel("A"))
            return background
        return image.convert("RGB")
    if fmt == "gif":
        return image.convert("RGBA") if has_alpha(image) else image.convert("P", palette=Image.Palette.ADAPTIVE)
    if image.mode not in {"RGB", "RGBA", "L", "LA", "P", "CMYK"}:
        return image.convert("RGBA" if has_alpha(image) else "RGB")
    return image


def save_image(
    ctx: JobContext[ToolOptions],
    image: Image.Image,
    item: InputFile,
    fmt: ImageFormat,
    suffix: str,
    quality: int = 85,
) -> OutputFile:
    pil_format, mime, extension = FORMATS[fmt]
    target = ctx.output_path(f"{item.stem}-{suffix}.{extension}")
    options: dict[str, object] = {}
    if fmt in {"jpg", "webp"}:
        options["quality"] = quality
    if fmt == "jpg":
        options["optimize"] = True
        options["progressive"] = True
    if fmt == "png":
        options["optimize"] = True
    prepared(image, fmt).save(target, format=pil_format, **options)
    return OutputFile(path=target, filename=target.name, mime_type=mime)


class ImageCompressOptions(ToolOptions):
    quality: int = Field(default=75, ge=10, le=100)
    format: Literal["keep", "jpg", "webp", "png"] = "keep"
    max_dimension: int = Field(default=0, ge=0, le=MAX_SIDE)
    reduce_png_colors: bool = False


class ImageCompressTool(Tool[ImageCompressOptions]):
    slug = "image-compress"
    name = "Compress image"
    category = ToolCategory.IMAGE
    summary = "Shrink images to a fraction of their size with a quality you choose."
    input_spec = IMAGE_SPEC
    options_schema = ImageCompressOptions
    seconds_per_mb = 0.3

    def run(self, ctx: JobContext[ImageCompressOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            image = load(item)
            if options.max_dimension and max(image.size) > options.max_dimension:
                image.thumbnail((options.max_dimension, options.max_dimension), Image.Resampling.LANCZOS)
            fmt: ImageFormat = editable_format(item) if options.format == "keep" else options.format
            if fmt in {"tiff", "bmp"}:
                fmt = "png"
            if fmt == "png" and options.reduce_png_colors and not has_alpha(image):
                image = image.convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT)
            output = save_image(ctx, image, item, fmt, "compressed", options.quality)
            if output.path.stat().st_size >= item.size_bytes and fmt == source_format(item):
                output.path.write_bytes(item.path.read_bytes())
            return [output]

        return run_each(ctx, handle, "Compressing image")


class ImageResizeOptions(ToolOptions):
    mode: Literal["percent", "dimensions", "longest_side"] = "percent"
    percent: float = Field(default=50.0, gt=0, le=400)
    width: int = Field(default=1280, ge=1, le=MAX_SIDE)
    height: int = Field(default=720, ge=1, le=MAX_SIDE)
    keep_aspect: bool = True
    longest_side: int = Field(default=1600, ge=16, le=MAX_SIDE)
    allow_upscale: bool = False


def target_size(image: Image.Image, options: ImageResizeOptions) -> tuple[int, int]:
    width, height = image.size
    if options.mode == "percent":
        scale = options.percent / 100
        return max(int(width * scale), 1), max(int(height * scale), 1)
    if options.mode == "longest_side":
        scale = options.longest_side / max(width, height)
        return max(int(width * scale), 1), max(int(height * scale), 1)
    if options.keep_aspect:
        scale = min(options.width / width, options.height / height)
        return max(int(width * scale), 1), max(int(height * scale), 1)
    return options.width, options.height


class ImageResizeTool(Tool[ImageResizeOptions]):
    slug = "image-resize"
    name = "Resize image"
    category = ToolCategory.IMAGE
    summary = "Resize images by percentage, exact size or longest side."
    input_spec = IMAGE_SPEC
    options_schema = ImageResizeOptions
    seconds_per_mb = 0.3

    def run(self, ctx: JobContext[ImageResizeOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            image = load(item)
            width, height = target_size(image, options)
            if (width > image.width or height > image.height) and not options.allow_upscale:
                width, height = min(width, image.width), min(height, image.height)
            if width * height > MAX_PIXELS or max(width, height) > MAX_SIDE:
                raise ToolInputError("The new size is too large.")
            resized = image.resize((width, height), Image.Resampling.LANCZOS)
            return [save_image(ctx, resized, item, editable_format(item), f"{width}x{height}")]

        return run_each(ctx, handle, "Resizing image")


class ImageConvertOptions(ToolOptions):
    format: ImageFormat = "jpg"
    quality: int = Field(default=90, ge=10, le=100)


class ImageConvertTool(Tool[ImageConvertOptions]):
    slug = "image-convert"
    name = "Convert image"
    category = ToolCategory.IMAGE
    summary = "Convert between JPG, PNG, WebP, TIFF, BMP and GIF."
    input_spec = IMAGE_SPEC
    options_schema = ImageConvertOptions
    seconds_per_mb = 0.3

    def run(self, ctx: JobContext[ImageConvertOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            return [save_image(ctx, load(item), item, options.format, "converted", options.quality)]

        return run_each(ctx, handle, "Converting image")


class ImageCropOptions(ToolOptions):
    aspect: Literal["free", "1:1", "4:3", "3:2", "16:9", "3:4", "2:3", "9:16"] = "free"
    left_percent: float = Field(default=0.0, ge=0, le=100)
    top_percent: float = Field(default=0.0, ge=0, le=100)
    width_percent: float = Field(default=100.0, gt=0, le=100)
    height_percent: float = Field(default=100.0, gt=0, le=100)


def crop_box(image: Image.Image, options: ImageCropOptions) -> tuple[int, int, int, int]:
    width, height = image.size
    left = width * options.left_percent / 100
    top = height * options.top_percent / 100
    box_w = min(width * options.width_percent / 100, width - left)
    box_h = min(height * options.height_percent / 100, height - top)
    if options.aspect != "free" and box_w > 0 and box_h > 0:
        ratio = ASPECTS[options.aspect]
        if box_w / box_h > ratio:
            new_w = box_h * ratio
            left += (box_w - new_w) / 2
            box_w = new_w
        else:
            new_h = box_w / ratio
            top += (box_h - new_h) / 2
            box_h = new_h
    if box_w < 1 or box_h < 1:
        raise ToolInputError("The crop area is empty.")
    return round(left), round(top), round(left + box_w), round(top + box_h)


class ImageCropTool(Tool[ImageCropOptions]):
    slug = "image-crop"
    name = "Crop image"
    category = ToolCategory.IMAGE
    summary = "Crop to a box or a fixed ratio such as 1:1, 4:3 or 16:9."
    input_spec = IMAGE_SPEC
    options_schema = ImageCropOptions
    seconds_per_mb = 0.2

    def run(self, ctx: JobContext[ImageCropOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            image = load(item)
            cropped = image.crop(crop_box(image, options))
            return [save_image(ctx, cropped, item, editable_format(item), "cropped")]

        return run_each(ctx, handle, "Cropping image")


class ImageRotateOptions(ToolOptions):
    angle: Literal[0, 90, 180, 270] = 90
    flip_horizontal: bool = False
    flip_vertical: bool = False


class ImageRotateTool(Tool[ImageRotateOptions]):
    slug = "image-rotate"
    name = "Rotate image"
    category = ToolCategory.IMAGE
    summary = "Rotate images in quarter turns and flip them."
    input_spec = IMAGE_SPEC
    options_schema = ImageRotateOptions
    seconds_per_mb = 0.2

    def run(self, ctx: JobContext[ImageRotateOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            image = load(item)
            if options.flip_horizontal:
                image = ImageOps.mirror(image)
            if options.flip_vertical:
                image = ImageOps.flip(image)
            if options.angle:
                image = image.rotate(-options.angle, expand=True)
            return [save_image(ctx, image, item, editable_format(item), "rotated")]

        return run_each(ctx, handle, "Rotating image")
