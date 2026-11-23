import io
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

import pypdfium2 as pdfium
from PIL import Image, ImageOps, ImageSequence
from pydantic import Field
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

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
    ToolFailedError,
    ToolOptions,
)
from app.tools.pages import parse_page_ranges
from app.tools.pdfkit import output_pdf, pdf_name

MAX_PIXELS = 200_000_000
MAX_FRAMES = 500
MAX_RENDER_PIXELS = 60_000_000
POINTS_PER_MM = 72 / 25.4
PAGE_SIZES = {"a4": (595.0, 842.0), "letter": (612.0, 792.0)}
IMAGE_SPEC = InputSpec(min_files=1, max_files=100, accepted_kinds=frozenset({FileKind.IMAGE}))
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ImageToPdfOptions(ToolOptions):
    page_size: Literal["fit", "a4", "letter"] = "a4"
    orientation: Literal["auto", "portrait", "landscape"] = "auto"
    margin_mm: float = Field(default=10.0, ge=0, le=50)
    merge: bool = True
    quality: int = Field(default=90, ge=40, le=100)


def _flatten(image: Image.Image) -> Image.Image:
    if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    if image.mode in {"RGB", "L"}:
        return image
    return image.convert("RGB")


def load_frames(path: Path) -> list[Image.Image]:
    frames: list[Image.Image] = []
    try:
        with Image.open(path) as source:
            for index, frame in enumerate(ImageSequence.Iterator(source)):
                if index >= MAX_FRAMES:
                    break
                if frame.width * frame.height > MAX_PIXELS:
                    raise ToolInputError("This image is too large to process safely.")
                transposed = ImageOps.exif_transpose(frame.copy())
                frames.append(_flatten(transposed))
    except (OSError, Image.DecompressionBombError, ValueError) as exc:
        raise ToolFailedError("This image could not be read.", code="image_unreadable") from exc
    if not frames:
        raise ToolFailedError("This image has no readable frames.", code="image_unreadable")
    return frames


def page_for(
    image: Image.Image, options: ImageToPdfOptions
) -> tuple[float, float, float, float, float, float]:
    margin = options.margin_mm * POINTS_PER_MM
    dpi_x = image.info.get("dpi", (96, 96))[0] or 96
    if options.page_size == "fit":
        width = image.width * 72 / dpi_x
        height = image.height * 72 / dpi_x
        return (width + 2 * margin, height + 2 * margin, margin, margin, width, height)
    width, height = PAGE_SIZES[options.page_size]
    landscape = image.width > image.height
    if options.orientation == "landscape" or (options.orientation == "auto" and landscape):
        width, height = max(width, height), min(width, height)
    else:
        width, height = min(width, height), max(width, height)
    box_w, box_h = width - 2 * margin, height - 2 * margin
    scale = min(box_w / image.width, box_h / image.height)
    draw_w, draw_h = image.width * scale, image.height * scale
    return (width, height, (width - draw_w) / 2, (height - draw_h) / 2, draw_w, draw_h)


def build_pdf(frames: list[Image.Image], options: ImageToPdfOptions, target: Path) -> None:
    pdf = canvas.Canvas(str(target), pageCompression=1)
    for frame in frames:
        width, height, x, y, draw_w, draw_h = page_for(frame, options)
        pdf.setPageSize((width, height))
        encoded = io.BytesIO()
        frame.save(encoded, format="JPEG", quality=options.quality)
        encoded.seek(0)
        pdf.drawImage(ImageReader(encoded), x, y, draw_w, draw_h)
        pdf.showPage()
    pdf.save()


class ImageToPdfTool(Tool[ImageToPdfOptions]):
    slug = "image-to-pdf"
    name = "Image to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Turn JPG, PNG, WebP and TIFF images into one PDF or one PDF each."
    input_spec = IMAGE_SPEC
    options_schema = ImageToPdfOptions
    seconds_per_mb = 0.4

    def run(self, ctx: JobContext[ImageToPdfOptions]) -> list[OutputFile]:
        options = ctx.options
        outputs: list[OutputFile] = []
        collected: list[Image.Image] = []
        total = len(ctx.inputs)
        for index, item in enumerate(ctx.inputs):
            ctx.ensure_not_cancelled()
            ctx.report(index / total * 0.9, f"Reading image {index + 1} of {total}")
            frames = load_frames(item.path)
            if options.merge:
                collected.extend(frames)
            else:
                target = ctx.output_path(pdf_name(item.stem, "image"))
                build_pdf(frames, options, target)
                outputs.append(output_pdf(target))
        if options.merge:
            ctx.report(0.92, "Building PDF")
            base = ctx.inputs[0].stem if total == 1 else "images"
            target = ctx.output_path(pdf_name(base, "images"))
            build_pdf(collected, options, target)
            outputs.append(output_pdf(target))
        ctx.report(1.0, "Packaging")
        return outputs


class PdfToImageOptions(ToolOptions):
    format: Literal["png", "jpg", "webp"] = "png"
    dpi: int = Field(default=150, ge=36, le=400)
    pages: str | None = Field(default=None, max_length=2000)
    quality: int = Field(default=90, ge=40, le=100)


IMAGE_MIME = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}
IMAGE_FORMAT = {"png": "PNG", "jpg": "JPEG", "webp": "WEBP"}


class PdfToImageTool(Tool[PdfToImageOptions]):
    slug = "pdf-to-image"
    name = "PDF to image"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Render PDF pages as PNG, JPG or WebP images."
    input_spec = InputSpec(
        min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = PdfToImageOptions
    seconds_per_page = 0.15

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PdfToImageOptions
    ) -> None:
        for info in files:
            if info.page_count is not None:
                parse_page_ranges(options.pages, info.page_count)

    def run(self, ctx: JobContext[PdfToImageOptions]) -> list[OutputFile]:
        options = ctx.options
        item: InputFile = ctx.inputs[0]
        outputs: list[OutputFile] = []
        try:
            document = pdfium.PdfDocument(str(item.path))
        except pdfium.PdfiumError as exc:
            raise ToolFailedError("This PDF could not be rendered.", code="pdf_unreadable") from exc
        try:
            selection = parse_page_ranges(options.pages, len(document))
            scale = options.dpi / 72
            for position, index in enumerate(selection):
                ctx.ensure_not_cancelled()
                ctx.report(position / len(selection), f"Rendering page {index + 1}")
                page = document[index]
                width, height = page.get_size()
                effective = min(scale, (MAX_RENDER_PIXELS / max(width * height, 1)) ** 0.5)
                image = page.render(scale=effective).to_pil().convert("RGB")
                page.close()
                target = ctx.output_path(f"{item.stem}-page-{index + 1:03d}.{options.format}")
                save_args: dict[str, int] = {}
                if options.format != "png":
                    save_args["quality"] = options.quality
                image.save(target, format=IMAGE_FORMAT[options.format], **save_args)
                outputs.append(
                    OutputFile(path=target, filename=target.name, mime_type=IMAGE_MIME[options.format])
                )
        finally:
            document.close()
        return outputs
