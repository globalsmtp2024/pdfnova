import io
from pathlib import Path
from typing import Literal

from PIL import Image, ImageChops, ImageFilter, ImageOps
from pydantic import Field
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.tools.base import JobContext, OutputFile, Tool, ToolCategory, ToolOptions
from app.tools.convert.images import (
    IMAGE_SPEC,
    PAGE_SIZES,
    load_frames,
)
from app.tools.pdfkit import output_pdf, pdf_name

ANALYSIS_SIDE = 400
DESKEW_LIMIT = 8.0
DESKEW_STEP = 0.5


class ScanToPdfOptions(ToolOptions):
    filter: Literal["color", "grayscale", "black_white"] = "color"
    auto_crop: bool = True
    straighten: bool = True
    page_size: Literal["fit", "a4", "letter"] = "a4"
    margin_mm: float = Field(default=0.0, ge=0, le=30)
    quality: int = Field(default=85, ge=40, le=100)


def analysis_copy(image: Image.Image) -> tuple[Image.Image, float]:
    scale = min(1.0, ANALYSIS_SIDE / max(image.size))
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.convert("L").resize(size, Image.Resampling.BILINEAR), scale


def row_sharpness(binary: Image.Image) -> float:
    profile = binary.resize((1, binary.height), Image.Resampling.BOX)
    values = [float(value) for value in profile.tobytes()]
    mean = sum(values) / len(values)
    return float(sum((value - mean) ** 2 for value in values))


def skew_angle(image: Image.Image) -> float:
    gray, _ = analysis_copy(image)
    gray = ImageOps.autocontrast(gray, cutoff=2)
    blurred = gray.filter(ImageFilter.GaussianBlur(max(2, gray.width // 60)))
    ink = ImageChops.subtract(blurred, gray).point(lambda value: 255 if value > 12 else 0)
    if ink.getbbox() is None:
        return 0.0
    best_angle = 0.0
    best_score = -1.0
    steps = int(DESKEW_LIMIT / DESKEW_STEP)
    for step in range(-steps, steps + 1):
        angle = step * DESKEW_STEP
        rotated = ink.rotate(angle, resample=Image.Resampling.NEAREST, fillcolor=0)
        score = row_sharpness(rotated)
        if score > best_score:
            best_score = score
            best_angle = angle
    return best_angle


def straightened(image: Image.Image) -> Image.Image:
    angle = skew_angle(image)
    if abs(angle) < DESKEW_STEP:
        return image
    fill = (255, 255, 255) if image.mode == "RGB" else 255
    return image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=fill)


def paper_box(image: Image.Image) -> tuple[int, int, int, int] | None:
    gray, scale = analysis_copy(image)
    smooth = gray.filter(ImageFilter.GaussianBlur(2))
    histogram = smooth.histogram()
    total = sum(histogram)
    cumulative = 0
    threshold = 0
    for level, count in enumerate(histogram):
        cumulative += count
        if cumulative >= total * 0.5:
            threshold = level
            break
    cutoff = max(60, int(threshold * 0.7))
    mask = smooth.point(lambda value: 255 if value >= cutoff else 0)
    mask = mask.filter(ImageFilter.MedianFilter(5))
    box = mask.getbbox()
    if box is None:
        return None
    left, top, right, bottom = box
    area = (right - left) * (bottom - top)
    if area < 0.25 * gray.width * gray.height:
        return None
    pad = 4
    left, top = max(0, left - pad), max(0, top - pad)
    right, bottom = min(gray.width, right + pad), min(gray.height, bottom + pad)
    return (
        round(left / scale),
        round(top / scale),
        min(image.width, round(right / scale)),
        min(image.height, round(bottom / scale)),
    )


def cropped(image: Image.Image) -> Image.Image:
    box = paper_box(image)
    return image if box is None else image.crop(box)


def black_white(image: Image.Image) -> Image.Image:
    gray = ImageOps.autocontrast(image.convert("L"), cutoff=1)
    radius = max(8, max(gray.size) // 40)
    background = gray.filter(ImageFilter.GaussianBlur(radius))
    darkness = ImageChops.subtract(background, gray)
    return darkness.point(lambda value: 0 if value > 18 else 255).convert("1")


def apply_filter(image: Image.Image, mode: str) -> Image.Image:
    if mode == "grayscale":
        return ImageOps.autocontrast(image.convert("L"), cutoff=1)
    if mode == "black_white":
        return black_white(image)
    return ImageOps.autocontrast(image.convert("RGB"), cutoff=1)


def encode(image: Image.Image, quality: int) -> io.BytesIO:
    encoded = io.BytesIO()
    if image.mode == "1":
        image.convert("L").save(encoded, format="PNG", optimize=True)
    else:
        image.save(encoded, format="JPEG", quality=quality)
    encoded.seek(0)
    return encoded


def layout(image: Image.Image, options: ScanToPdfOptions) -> tuple[float, float, float, float, float, float]:
    margin = options.margin_mm * 72 / 25.4
    if options.page_size == "fit":
        width, height = image.width * 72 / 200, image.height * 72 / 200
        return (width + 2 * margin, height + 2 * margin, margin, margin, width, height)
    width, height = PAGE_SIZES[options.page_size]
    if image.width > image.height:
        width, height = height, width
    scale = min((width - 2 * margin) / image.width, (height - 2 * margin) / image.height)
    draw_w, draw_h = image.width * scale, image.height * scale
    return (width, height, (width - draw_w) / 2, (height - draw_h) / 2, draw_w, draw_h)


def build_scan_pdf(pages: list[Image.Image], options: ScanToPdfOptions, target: Path) -> None:
    pdf = canvas.Canvas(str(target), pageCompression=1)
    for page in pages:
        width, height, x, y, draw_w, draw_h = layout(page, options)
        pdf.setPageSize((width, height))
        pdf.drawImage(ImageReader(encode(page, options.quality)), x, y, draw_w, draw_h)
        pdf.showPage()
    pdf.save()


class ScanToPdfTool(Tool[ScanToPdfOptions]):
    slug = "scan-to-pdf"
    name = "Scan to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Turn photos of pages into a clean, straightened scan PDF."
    input_spec = IMAGE_SPEC
    options_schema = ScanToPdfOptions
    seconds_per_mb = 1.0

    def run(self, ctx: JobContext[ScanToPdfOptions]) -> list[OutputFile]:
        options = ctx.options
        pages: list[Image.Image] = []
        total = len(ctx.inputs)
        for index, item in enumerate(ctx.inputs):
            ctx.ensure_not_cancelled()
            ctx.report(index / total * 0.9, f"Cleaning page {index + 1} of {total}")
            for frame in load_frames(item.path):
                work = frame.convert("RGB")
                if options.straighten:
                    work = straightened(work)
                if options.auto_crop:
                    work = cropped(work)
                pages.append(apply_filter(work, options.filter))
        ctx.report(0.93, "Building PDF")
        target = ctx.output_path(pdf_name("scan", "scan"))
        build_scan_pdf(pages, options, target)
        ctx.report(1.0, "Packaging")
        return [output_pdf(target)]
