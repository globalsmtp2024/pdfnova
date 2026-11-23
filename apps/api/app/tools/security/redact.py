import zlib
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Literal

import pikepdf
import pypdfium2 as pdfium
import regex
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
    ToolFailedError,
    ToolOptions,
)
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

MAX_REDACT_PIXELS = 60_000_000
REGEX_TIMEOUT_SECONDS = 2.0
Box = tuple[float, float, float, float]
PresetName = Literal["email", "phone", "card", "cnic", "iban", "ssn"]


def luhn_valid(text: str) -> bool:
    digits = [int(ch) for ch in text if ch.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    for index, digit in enumerate(reversed(digits)):
        value = digit * 2 if index % 2 else digit
        total += value - 9 if value > 9 else value
    return total % 10 == 0


def iban_valid(text: str) -> bool:
    compact = "".join(text.split()).upper()
    if not 15 <= len(compact) <= 34 or not compact.isalnum():
        return False
    rearranged = compact[4:] + compact[:4]
    number = "".join(str(int(ch, 36)) for ch in rearranged)
    return int(number) % 97 == 1


def ssn_valid(text: str) -> bool:
    area, group, serial = text.split("-")
    return area not in {"000", "666"} and not area.startswith("9") and group != "00" and serial != "0000"


def phone_valid(text: str) -> bool:
    digits = sum(ch.isdigit() for ch in text)
    return 9 <= digits <= 15


def cnic_valid(text: str) -> bool:
    digits = "".join(ch for ch in text if ch.isdigit())
    return len(digits) == 13 and digits[0] in "1234567"


PRESETS: dict[str, tuple[str, Callable[[str], bool] | None]] = {
    "email": (r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", None),
    "phone": (
        r"(?<!\d)(?:(?:\+|00)\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)\d{3,4}[\s\-.]?\d{3,4}(?!\d)"
        r"|(?<!\d)0\d{3}[\s\-]?\d{7}(?!\d)",
        phone_valid,
    ),
    "card": (r"(?<!\d)(?:\d[ \-]?){12,18}\d(?!\d)", luhn_valid),
    "cnic": (r"(?<!\d)\d{5}-\d{7}-\d(?!\d)|(?<![\d-])\d{13}(?![\d-])", cnic_valid),
    "iban": (r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b", iban_valid),
    "ssn": (r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)", ssn_valid),
}


@dataclass(frozen=True)
class Matcher:
    name: str
    pattern: "regex.Pattern[str]"
    validator: Callable[[str], bool] | None = None

    def spans(self, text: str) -> list[tuple[int, int]]:
        found: list[tuple[int, int]] = []
        try:
            for match in self.pattern.finditer(text, timeout=REGEX_TIMEOUT_SECONDS):
                if match.end() > match.start() and (self.validator is None or self.validator(match.group())):
                    found.append((match.start(), match.end()))
        except TimeoutError as exc:
            raise ToolFailedError(
                "A search pattern took too long to evaluate. Simplify it and try again.",
                code="pattern_timeout",
            ) from exc
        return found


class RedactOptions(ToolOptions):
    boxes: list[str] = Field(default_factory=list, max_length=2000)
    patterns: list[str] = Field(default_factory=list, max_length=100)
    presets: list[PresetName] = Field(default_factory=list, max_length=6)
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


def compile_patterns(patterns: list[str], ignore_case: bool) -> list[Matcher]:
    flags = regex.IGNORECASE if ignore_case else 0
    compiled: list[Matcher] = []
    for pattern in patterns:
        if len(pattern) > 300:
            raise ToolInputError("Search patterns can be at most 300 characters long.")
        try:
            compiled.append(Matcher("custom", regex.compile(pattern, flags)))
        except regex.error as exc:
            raise ToolInputError(f"“{pattern}” is not a valid pattern: {exc}.") from exc
    return compiled


def build_matchers(options: RedactOptions) -> list[Matcher]:
    matchers = [
        Matcher(name, regex.compile(PRESETS[name][0]), PRESETS[name][1])
        for name in dict.fromkeys(options.presets)
    ]
    return matchers + compile_patterns(options.patterns, options.ignore_case)


def user_to_visual(geometry: PageGeometry, x: float, y: float) -> tuple[float, float]:
    dx, dy = x - geometry.left, y - geometry.bottom
    if geometry.rotation == 90:
        return dy, geometry.width - dx
    if geometry.rotation == 180:
        return geometry.width - dx, geometry.height - dy
    if geometry.rotation == 270:
        return geometry.height - dy, dx
    return dx, dy


def page_text(textpage: Any) -> str:
    count = textpage.count_chars()
    text = textpage.get_text_range()
    if len(text) != count:
        text = "".join(textpage.get_text_range(position, 1) for position in range(count))
    return str(text)


def pattern_boxes(
    document: pdfium.PdfDocument, index: int, geometry: PageGeometry, matchers: list[Matcher]
) -> tuple[list[Box], Counter[str]]:
    if not matchers:
        return [], Counter()
    page = document[index]
    textpage = page.get_textpage()
    try:
        text = page_text(textpage)
        boxes: list[Box] = []
        counts: Counter[str] = Counter()
        for matcher in matchers:
            for start, end in matcher.spans(text):
                counts[matcher.name] += 1
                for position in range(start, end):
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
        return boxes, counts
    finally:
        textpage.close()
        page.close()


def verify_output(path: Any, matchers: list[Matcher], redacted_pages: set[int]) -> tuple[int, int]:
    document = pdfium.PdfDocument(str(path))
    leftovers = 0
    text_on_redacted = 0
    try:
        for index in range(len(document)):
            page = document[index]
            textpage = page.get_textpage()
            try:
                text = page_text(textpage)
            finally:
                textpage.close()
                page.close()
            if index in redacted_pages:
                text_on_redacted += len(text.strip())
            for matcher in matchers:
                leftovers += len(matcher.spans(text))
    finally:
        document.close()
    return leftovers, text_on_redacted


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
    for key in (
        "/CropBox",
        "/TrimBox",
        "/BleedBox",
        "/ArtBox",
        "/Rotate",
        "/Annots",
        "/Metadata",
        "/Thumb",
        "/AA",
    ):
        if key in page.obj:
            del page.obj[key]


def redact_with(ctx: JobContext[Any], options: RedactOptions) -> list[OutputFile]:
    item: InputFile = ctx.inputs[0]
    matchers = build_matchers(options)
    document = pdfium.PdfDocument(str(item.path))
    found: Counter[str] = Counter()
    pages_redacted: dict[int, int] = {}
    try:
        with open_pdf(item) as pdf:
            count = len(pdf.pages)
            manual: dict[int, list[Box]] = {}
            for line in options.boxes:
                index, box = parse_box(line, count)
                manual.setdefault(index, []).append(box)
            for index in range(count):
                ctx.ensure_not_cancelled()
                ctx.report(index / count * 0.7, f"Checking page {index + 1}")
                geometry = page_geometry(pdf.pages[index])
                matched, counts = pattern_boxes(document, index, geometry, matchers)
                found.update(counts)
                boxes = manual.get(index, []) + matched
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
                pages_redacted[index] = len(boxes)
            if not pages_redacted:
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
    ctx.report(0.85, "Verifying the result")
    leftovers, hidden_text = verify_output(target, matchers, set(pages_redacted))
    if leftovers or hidden_text:
        target.unlink(missing_ok=True)
        raise ToolFailedError(
            "Verification failed: some sensitive text could still be extracted, so no file was produced.",
            code="redaction_verification_failed",
        )
    report = ctx.output_path("redaction-report.txt")
    lines = [
        "Redaction report",
        f"Pages redacted: {len(pages_redacted)} of {count}",
        f"Areas blacked out: {sum(pages_redacted.values())}",
    ]
    for name, total in sorted(found.items()):
        lines.append(f"Pattern matches removed ({name}): {total}")
    for index, total in sorted(pages_redacted.items()):
        lines.append(f"  Page {index + 1}: {total} area(s)")
    lines.append("Verification: the output was re-read and no text matching your patterns remains.")
    lines.append("Verification: redacted pages contain no extractable text (they were rebuilt as images).")
    lines.append("The report lists counts only; it never repeats the redacted content.")
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return [output_pdf(target), OutputFile(path=report, filename=report.name, mime_type="text/plain")]


class RedactTool(Tool[RedactOptions]):
    slug = "redact"
    name = "Redact PDF"
    category = ToolCategory.SECURITY
    summary = (
        "Permanently black out areas or text patterns. Redacted pages are rebuilt without the hidden text."
    )
    input_spec = InputSpec(
        min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = RedactOptions
    seconds_per_page = 0.2

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: RedactOptions) -> None:
        if not options.boxes and not options.patterns and not options.presets:
            raise ToolInputError("Add at least one box, preset or search pattern to redact.")
        compile_patterns(options.patterns, options.ignore_case)
        for info in files:
            if info.page_count is not None:
                for line in options.boxes:
                    parse_box(line, info.page_count)

    def run(self, ctx: JobContext[RedactOptions]) -> list[OutputFile]:
        return redact_with(ctx, ctx.options)
