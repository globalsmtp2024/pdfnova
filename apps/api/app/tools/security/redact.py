import re
import zlib
from collections.abc import Sequence

import pikepdf
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
from pydantic import Field

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.text.geometry import PageGeometry, page_geometry
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
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

MAX_REDACT_PIXELS = 60_000_000
Box = tuple[float, float, float, float]


class RedactOptions(ToolOptions):
    boxes: list[str] = Field(default_factory=list, max_length=2000)
    patterns: list[str] = Field(default_factory=list, max_length=100)
    ignore_case: bool = True
    dpi: int = Field(default=200, ge=100, le=300)
    strip_metadata: bool = True


def parse_box(line: str, page_count: int) -> tuple[int, Box]:
    parts = [part.strip() for part in line.split("|")]
    if len(parts) != 5:
        raise ToolInputError(f"“{line}” is not a redaction box.", hint="Write: page | x | y | width | height")
    try:
        page = int(parts[0])
        x, y, width, height = (float(value) for value in parts[1:])
    except ValueError as exc:
        raise ToolInputError(f"“{line}” has a value that is not a number.") from exc
    if not 1 <= page <= page_count:
        raise ToolInputError(f"A box points at page {page}, but the document has {page_count}.")
    if width <= 0 or height <= 0:
        raise ToolInputError("Box width and height must be positive.")
    return page - 1, (x, y, x + width, y + height)


def compile_patterns(patterns: list[str], ignore_case: bool) -> list[re.Pattern[str]]:
    flags = re.IGNORECASE if ignore_case else 0
    compiled: list[re.Pattern[str]] = []
    for pattern in patterns:
        if len(pattern) > 300:
            raise ToolInputError("Search patterns can be at most 300 characters long.")
        try:
            compiled.append(re.compile(pattern, flags))
        except re.error as exc:
            raise ToolInputError(f"“{pattern}” is not a valid pattern: {exc}.") from exc
    return compiled


def user_to_visual(geometry: PageGeometry, x: float, y: float) -> tuple[float, float]:
    dx, dy = x - geometry.left, y - geometry.bottom
    if geometry.rotation == 90:
        return dy, geometry.width - dx
    if geometry.rotation == 180:
        return geometry.width - dx, geometry.height - dy
    if geometry.rotation == 270:
        return geometry.height - dy, dx
    return dx, dy


def pattern_boxes(
    document: pdfium.PdfDocument, index: int, geometry: PageGeometry, patterns: list[re.Pattern[str]]
) -> list[Box]:
    if not patterns:
        return []
    page = document[index]
    textpage = page.get_textpage()
    try:
        count = textpage.count_chars()
        text = textpage.get_text_range()
        if len(text) != count:
            text = "".join(textpage.get_text_range(position, 1) for position in range(count))
        boxes: list[Box] = []
        for pattern in patterns:
            for match in pattern.finditer(text):
                for position in range(match.start(), match.end()):
                    if text[position].isspace():
                        continue
                    left, bottom, right, top = textpage.get_charbox(position)
                    first = user_to_visual(geometry, left, bottom)
                    second = user_to_visual(geometry, right, top)
                    boxes.append(
                        (
                            min(first[0], second[0]) - 1,
                            min(first[1], second[1]) - 1,
                            max(first[0], second[0]) + 1,
                            max(first[1], second[1]) + 1,
                        )
                    )
        return boxes
    finally:
        textpage.close()
        page.close()


def raster_page(pdf: pikepdf.Pdf, index: int, image: Image.Image, geometry: PageGeometry) -> None:
    page = pdf.pages[index]
    rgb = image.convert("RGB")
    stream = pikepdf.Stream(pdf, zlib.compress(rgb.tobytes(), 6))
    stream.Type = pikepdf.Name.XObject
    stream.Subtype = pikepdf.Name.Image
    stream.Width = rgb.width
    stream.Height = rgb.height
    stream.ColorSpace = pikepdf.Name.DeviceRGB
    stream.BitsPerComponent = 8
    stream.Filter = pikepdf.Name.FlateDecode
    width, height = geometry.visual_width, geometry.visual_height
    page.obj.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im0=pdf.make_indirect(stream)))
    page.obj.Contents = pdf.make_stream(f"q {width:.4f} 0 0 {height:.4f} 0 0 cm /Im0 Do Q".encode("ascii"))
    page.obj.MediaBox = pikepdf.Array([0, 0, width, height])
    for key in ("/CropBox", "/TrimBox", "/BleedBox", "/ArtBox", "/Rotate", "/Annots", "/Metadata", "/Thumb", "/AA"):
        if key in page.obj:
            del page.obj[key]


class RedactTool(Tool[RedactOptions]):
    slug = "redact"
    name = "Redact PDF"
    category = ToolCategory.SECURITY
    summary = "Permanently black out areas or text patterns. Redacted pages are rebuilt without the hidden text."
    input_spec = InputSpec(
        min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = RedactOptions
    seconds_per_page = 0.2

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: RedactOptions) -> None:
        if not options.boxes and not options.patterns:
            raise ToolInputError("Add at least one box or search pattern to redact.")
        compile_patterns(options.patterns, options.ignore_case)
        for info in files:
            if info.page_count is not None:
                for line in options.boxes:
                    parse_box(line, info.page_count)

    def run(self, ctx: JobContext[RedactOptions]) -> list[OutputFile]:
        options = ctx.options
        item: InputFile = ctx.inputs[0]
        patterns = compile_patterns(options.patterns, options.ignore_case)
        document = pdfium.PdfDocument(str(item.path))
        try:
            with open_pdf(item) as pdf:
                count = len(pdf.pages)
                manual: dict[int, list[Box]] = {}
                for line in options.boxes:
                    index, box = parse_box(line, count)
                    manual.setdefault(index, []).append(box)
                redacted = 0
                for index in range(count):
                    ctx.ensure_not_cancelled()
                    ctx.report(index / count, f"Checking page {index + 1}")
                    geometry = page_geometry(pdf.pages[index])
                    boxes = manual.get(index, []) + pattern_boxes(document, index, geometry, patterns)
                    if not boxes:
                        continue
                    scale = options.dpi / 72
                    pixels = geometry.visual_width * geometry.visual_height * scale * scale
                    if pixels > MAX_REDACT_PIXELS:
                        scale *= (MAX_REDACT_PIXELS / pixels) ** 0.5
                    page = document[index]
                    image = page.render(scale=scale).to_pil().convert("RGB")
                    page.close()
                    draw = ImageDraw.Draw(image)
                    for left, bottom, right, top in boxes:
                        draw.rectangle(
                            (
                                left * scale,
                                image.height - top * scale,
                                right * scale,
                                image.height - bottom * scale,
                            ),
                            fill=(0, 0, 0),
                        )
                    raster_page(pdf, index, image, geometry)
                    redacted += 1
                if redacted == 0:
                    raise ToolInputError("Nothing matched, so no pages were changed.")
                if options.strip_metadata:
                    for key in list(pdf.docinfo.keys()):
                        del pdf.docinfo[key]
                    if "/Metadata" in pdf.Root:
                        del pdf.Root["/Metadata"]
                target = ctx.output_path(pdf_name(f"{item.stem}-redacted", "redacted"))
                save_pdf(pdf, target)
        finally:
            document.close()
        return [output_pdf(target)]
