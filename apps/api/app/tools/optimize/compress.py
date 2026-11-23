import hashlib
import io
import math
import shutil
import zlib
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import pikepdf
from PIL import Image
from pydantic import Field, model_validator

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
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

Level = Literal["low", "recommended", "extreme", "custom"]
Matrix = tuple[float, float, float, float, float, float]

IDENTITY: Matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
MAX_FORM_DEPTH = 12
MAX_IMAGE_PIXELS = 80_000_000
RESAMPLE_MARGIN = 1.15
JPEG_REENCODE_GAIN = 0.85
SKIPPED_FILTERS = frozenset({"/JBIG2Decode", "/CCITTFaxDecode", "/JPXDecode"})
DEVICE_SPACES = {"/DeviceGray": 1, "/DeviceRGB": 3, "/DeviceCMYK": 4}
MODE_SPACES = {"L": "/DeviceGray", "RGB": "/DeviceRGB", "CMYK": "/DeviceCMYK"}
CHANNELS = {"L": 1, "RGB": 3, "CMYK": 4}


@dataclass(frozen=True)
class Profile:
    dpi: int
    quality: int
    max_edge: int
    reencode_jpeg: bool


PROFILES: dict[str, Profile] = {
    "low": Profile(dpi=220, quality=85, max_edge=3000, reencode_jpeg=False),
    "recommended": Profile(dpi=150, quality=72, max_edge=2000, reencode_jpeg=True),
    "extreme": Profile(dpi=96, quality=50, max_edge=1300, reencode_jpeg=True),
}

CUSTOM_LADDER: tuple[Profile, ...] = (
    Profile(dpi=220, quality=85, max_edge=3000, reencode_jpeg=True),
    Profile(dpi=180, quality=78, max_edge=2400, reencode_jpeg=True),
    Profile(dpi=150, quality=72, max_edge=2000, reencode_jpeg=True),
    Profile(dpi=120, quality=62, max_edge=1600, reencode_jpeg=True),
    Profile(dpi=96, quality=50, max_edge=1300, reencode_jpeg=True),
    Profile(dpi=72, quality=40, max_edge=1000, reencode_jpeg=True),
    Profile(dpi=60, quality=30, max_edge=800, reencode_jpeg=True),
    Profile(dpi=48, quality=22, max_edge=640, reencode_jpeg=True),
)


class CompressOptions(ToolOptions):
    level: Level = "recommended"
    target_kb: int | None = Field(default=None, ge=1, le=4 * 1024 * 1024)
    grayscale: bool = False
    strip_metadata: bool = False

    @model_validator(mode="after")
    def _target_needed(self) -> "CompressOptions":
        if self.level == "custom" and self.target_kb is None:
            raise ValueError("Enter the size you want the PDF to be.")
        return self


@dataclass
class Placement:
    width_in: float = 0.0
    height_in: float = 0.0

    def include(self, width_in: float, height_in: float) -> None:
        self.width_in = max(self.width_in, width_in)
        self.height_in = max(self.height_in, height_in)


@dataclass(frozen=True)
class Outcome:
    path: Path
    size: int


def _multiply(first: Matrix, second: Matrix) -> Matrix:
    a1, b1, c1, d1, e1, f1 = first
    a2, b2, c2, d2, e2, f2 = second
    return (
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2,
    )


def _as_matrix(values: Sequence[object]) -> Matrix | None:
    if len(values) != 6:
        return None
    try:
        numbers = [float(value) for value in values]  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not all(math.isfinite(number) for number in numbers):
        return None
    return (numbers[0], numbers[1], numbers[2], numbers[3], numbers[4], numbers[5])


def _page_resources(page: pikepdf.Page) -> pikepdf.Object | None:
    node: pikepdf.Object | None = page.obj
    for _ in range(64):
        if not isinstance(node, pikepdf.Dictionary):
            return None
        resources = node.get("/Resources")
        if isinstance(resources, pikepdf.Dictionary):
            return resources
        node = node.get("/Parent")
    return None


def _walk(
    content: pikepdf.Object | pikepdf.Page,
    resources: pikepdf.Object | None,
    ctm: Matrix,
    depth: int,
    placements: dict[tuple[int, int], Placement],
) -> None:
    if depth > MAX_FORM_DEPTH:
        return
    xobjects = resources.get("/XObject") if isinstance(resources, pikepdf.Dictionary) else None
    stack: list[Matrix] = []
    current = ctm
    for instruction in pikepdf.parse_content_stream(content, "q Q cm Do"):
        operator = str(instruction.operator)
        if operator == "q":
            stack.append(current)
        elif operator == "Q":
            current = stack.pop() if stack else ctm
        elif operator == "cm":
            matrix = _as_matrix(list(instruction.operands))
            if matrix is not None:
                current = _multiply(matrix, current)
        elif operator == "Do" and isinstance(xobjects, pikepdf.Dictionary) and instruction.operands:
            target = xobjects.get(str(instruction.operands[0]))
            if not isinstance(target, pikepdf.Stream):
                continue
            subtype = target.get("/Subtype")
            if subtype == pikepdf.Name.Image and target.is_indirect:
                a, b, c, d, _, _ = current
                placements.setdefault(target.objgen, Placement()).include(
                    math.hypot(a, b) / 72.0, math.hypot(c, d) / 72.0
                )
            elif subtype == pikepdf.Name.Form:
                matrix_value = target.get("/Matrix")
                form_matrix = (
                    _as_matrix([matrix_value[i] for i in range(len(matrix_value))])
                    if isinstance(matrix_value, pikepdf.Array)
                    else None
                )
                inner = _multiply(form_matrix or IDENTITY, current)
                form_resources = target.get("/Resources")
                _walk(
                    target,
                    form_resources if isinstance(form_resources, pikepdf.Dictionary) else resources,
                    inner,
                    depth + 1,
                    placements,
                )


def image_placements(pdf: pikepdf.Pdf) -> dict[tuple[int, int], Placement]:
    placements: dict[tuple[int, int], Placement] = {}
    for page in pdf.pages:
        try:
            _walk(page, _page_resources(page), IDENTITY, 0, placements)
        except (pikepdf.PdfError, ValueError, TypeError, RecursionError):
            continue
    return placements


def _filters(image: pikepdf.Stream) -> list[str]:
    value = image.get("/Filter")
    if isinstance(value, pikepdf.Array):
        return [str(value[index]) for index in range(len(value))]
    return [str(value)] if value is not None else []


def _colorspace_channels(space: pikepdf.Object | None) -> int | None:
    if isinstance(space, pikepdf.Name):
        return DEVICE_SPACES.get(str(space))
    if isinstance(space, pikepdf.Array) and len(space) == 2 and space[0] == pikepdf.Name.ICCBased:
        profile = space[1]
        if isinstance(profile, pikepdf.Stream):
            count = profile.get("/N")
            if isinstance(count, int) and int(count) in (1, 3, 4):
                return int(count)
    return None


def _eligible(image: pikepdf.Stream) -> bool:
    if bool(image.get("/ImageMask")) or "/Decode" in image or "/SMaskInData" in image:
        return False
    if isinstance(image.get("/Mask"), pikepdf.Array):
        return False
    if image.get("/BitsPerComponent") != 8:
        return False
    if any(name in SKIPPED_FILTERS for name in _filters(image)):
        return False
    width, height = image.get("/Width"), image.get("/Height")
    if not isinstance(width, int) or not isinstance(height, int):
        return False
    if width < 16 or height < 16 or int(width) * int(height) > MAX_IMAGE_PIXELS:
        return False
    return _colorspace_channels(image.get("/ColorSpace")) is not None


def _target_size(width: int, height: int, placement: Placement | None, profile: Profile) -> tuple[int, int]:
    scale = 1.0
    if placement is not None and placement.width_in > 0 and placement.height_in > 0:
        effective = min(width / placement.width_in, height / placement.height_in)
        if effective > profile.dpi * RESAMPLE_MARGIN:
            scale = profile.dpi / effective
    else:
        longest = max(width, height)
        if longest > profile.max_edge * RESAMPLE_MARGIN:
            scale = profile.max_edge / longest
    return max(1, round(width * scale)), max(1, round(height * scale))


def _is_flat_graphic(picture: Image.Image) -> bool:
    sample = picture.copy()
    sample.thumbnail((256, 256))
    return sample.getcolors(maxcolors=256) is not None


def _encode(picture: Image.Image, profile: Profile, lossless: bool) -> tuple[bytes, pikepdf.Name]:
    if lossless:
        return zlib.compress(picture.tobytes(), 9), pikepdf.Name.FlateDecode
    buffer = io.BytesIO()
    picture.save(buffer, format="JPEG", quality=profile.quality, optimize=True, subsampling=2)
    return buffer.getvalue(), pikepdf.Name.DCTDecode


def _recompress_image(
    image: pikepdf.Stream, placement: Placement | None, profile: Profile, gray: bool
) -> bool:
    if not _eligible(image):
        return False
    width, height = int(image.Width), int(image.Height)
    new_width, new_height = _target_size(width, height, placement, profile)
    resized = (new_width, new_height) != (width, height)
    was_jpeg = "/DCTDecode" in _filters(image)
    channels = _colorspace_channels(image.get("/ColorSpace"))
    to_gray = gray and channels != 1
    if was_jpeg and not resized and not to_gray and not profile.reencode_jpeg:
        return False
    try:
        picture = pikepdf.PdfImage(image).as_pil_image()
    except (pikepdf.PdfError, NotImplementedError, ValueError, OSError, TypeError):
        return False
    if picture.mode not in CHANNELS or CHANNELS[picture.mode] != channels:
        return False
    if to_gray:
        picture = (picture.convert("RGB") if picture.mode == "CMYK" else picture).convert("L")
    if resized:
        picture = picture.resize((new_width, new_height), Image.Resampling.LANCZOS)
    lossless = not was_jpeg and _is_flat_graphic(picture)
    if lossless and not resized and not to_gray:
        return False
    data, codec = _encode(picture, profile, lossless)
    required = JPEG_REENCODE_GAIN if was_jpeg and not resized else 1.0
    if len(data) >= len(image.read_raw_bytes()) * required and not to_gray:
        return False
    keep_space = not to_gray and not isinstance(image.get("/ColorSpace"), pikepdf.Name)
    space = image.get("/ColorSpace") if keep_space else pikepdf.Name(MODE_SPACES[picture.mode])
    image.write(data, filter=codec)
    if "/DecodeParms" in image:
        del image["/DecodeParms"]
    image.Width = picture.width
    image.Height = picture.height
    image.BitsPerComponent = 8
    image.ColorSpace = space
    if picture.mode == "CMYK" and codec == pikepdf.Name.DCTDecode:
        image.Decode = pikepdf.Array([1, 0] * 4)
    return True


def _soft_mask_ids(pdf: pikepdf.Pdf) -> set[tuple[int, int]]:
    masks: set[tuple[int, int]] = set()
    for item in pdf.objects:
        if isinstance(item, pikepdf.Stream):
            for key in ("/SMask", "/Mask"):
                mask = item.get(key)
                if isinstance(mask, pikepdf.Stream) and mask.is_indirect:
                    masks.add(mask.objgen)
    return masks


def recompress_images(pdf: pikepdf.Pdf, ctx: JobContext[CompressOptions], profile: Profile) -> int:
    placements = image_placements(pdf)
    masks = _soft_mask_ids(pdf)
    changed = 0
    for item in list(pdf.objects):
        if not isinstance(item, pikepdf.Stream) or item.get("/Subtype") != pikepdf.Name.Image:
            continue
        if item.objgen in masks:
            continue
        ctx.ensure_not_cancelled()
        if _recompress_image(item, placements.get(item.objgen), profile, ctx.options.grayscale):
            changed += 1
    return changed


def _signature(stream: pikepdf.Stream) -> tuple[str, tuple[tuple[str, str], ...]]:
    digest = hashlib.sha256(stream.read_raw_bytes()).hexdigest()
    entries = tuple(sorted((str(key), repr(value)) for key, value in stream.items() if key != "/Length"))
    return digest, entries


def deduplicate_streams(pdf: pikepdf.Pdf) -> int:
    candidates: list[pikepdf.Stream] = []
    for item in pdf.objects:
        if isinstance(item, pikepdf.Stream) and item.get("/Subtype") == pikepdf.Name.Image:
            candidates.append(item)
        elif isinstance(item, pikepdf.Dictionary) and item.get("/Type") == pikepdf.Name.FontDescriptor:
            for key in ("/FontFile", "/FontFile2", "/FontFile3"):
                program = item.get(key)
                if isinstance(program, pikepdf.Stream) and program.is_indirect:
                    candidates.append(program)
    canonical: dict[tuple[str, tuple[tuple[str, str], ...]], pikepdf.Stream] = {}
    remap: dict[tuple[int, int], pikepdf.Stream] = {}
    seen: set[tuple[int, int]] = set()
    for stream in candidates:
        if not stream.is_indirect or stream.objgen in seen:
            continue
        seen.add(stream.objgen)
        first = canonical.setdefault(_signature(stream), stream)
        if first.objgen != stream.objgen:
            remap[stream.objgen] = first
    if not remap:
        return 0
    for item in list(pdf.objects):
        _relink(item, remap, 0)
    for page in pdf.pages:
        _relink(page.obj, remap, 0)
    return len(remap)


def _relink(node: pikepdf.Object, remap: dict[tuple[int, int], pikepdf.Stream], depth: int) -> None:
    if depth > 32:
        return
    if isinstance(node, pikepdf.Dictionary | pikepdf.Stream):
        for key in list(node.keys()):
            value = node.get(key)
            if not isinstance(value, pikepdf.Object):
                continue
            if value.is_indirect:
                if value.objgen in remap:
                    node[key] = remap[value.objgen]
            else:
                _relink(value, remap, depth + 1)
    elif isinstance(node, pikepdf.Array):
        for index in range(len(node)):
            value = node[index]
            if not isinstance(value, pikepdf.Object):
                continue
            if value.is_indirect:
                if value.objgen in remap:
                    node[index] = remap[value.objgen]
            else:
                _relink(value, remap, depth + 1)


def strip_extras(pdf: pikepdf.Pdf, strip_metadata: bool) -> None:
    for page in pdf.pages:
        for key in ("/Thumb", "/PieceInfo"):
            if key in page.obj:
                del page.obj[key]
    if "/PieceInfo" in pdf.Root:
        del pdf.Root["/PieceInfo"]
    if strip_metadata:
        if "/Metadata" in pdf.Root:
            del pdf.Root["/Metadata"]
        if "/Info" in pdf.trailer:
            del pdf.trailer["/Info"]


def compress_file(item: InputFile, ctx: JobContext[CompressOptions], profile: Profile, target: Path) -> int:
    pikepdf.settings.set_flate_compression_level(9)
    with open_pdf(item) as pdf:
        strip_extras(pdf, ctx.options.strip_metadata)
        recompress_images(pdf, ctx, profile)
        deduplicate_streams(pdf)
        save_pdf(
            pdf,
            target,
            recompress_flate=True,
            stream_decode_level=pikepdf.StreamDecodeLevel.generalized,
        )
    return target.stat().st_size


def search_target(
    item: InputFile, ctx: JobContext[CompressOptions], target_bytes: int, workdir: Path
) -> tuple[Outcome, bool]:
    cache: dict[int, Outcome] = {}

    def attempt(index: int) -> Outcome:
        if index not in cache:
            ctx.ensure_not_cancelled()
            path = workdir / f"attempt-{index}.pdf"
            cache[index] = Outcome(path, compress_file(item, ctx, CUSTOM_LADDER[index], path))
        return cache[index]

    if attempt(0).size <= target_bytes:
        return attempt(0), True
    last = len(CUSTOM_LADDER) - 1
    if attempt(last).size > target_bytes:
        return min(cache.values(), key=lambda outcome: outcome.size), False
    low, high = 1, last
    while low < high:
        middle = (low + high) // 2
        if attempt(middle).size <= target_bytes:
            high = middle
        else:
            low = middle + 1
    return attempt(low), True


def describe_outcome(original: int, final: int, reached: bool | None, target_bytes: int | None) -> str:
    if final >= original:
        return "Already optimized: the original file is kept"
    saved = round((1 - final / original) * 100)
    if reached is False and target_bytes is not None:
        return f"Target size not reachable; smallest result saves {saved}%"
    return f"Saved {saved}%"


class CompressTool(Tool[CompressOptions]):
    slug = "compress"
    name = "Compress PDF"
    category = ToolCategory.OPTIMIZE
    summary = "Shrink PDFs by downsampling images, removing duplicates and packing objects tightly."
    input_spec = InputSpec(
        min_files=1, max_files=50, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = CompressOptions
    seconds_per_mb = 0.6
    seconds_per_page = 0.02

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: CompressOptions
    ) -> None:
        return None

    def run(self, ctx: JobContext[CompressOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, index: int) -> list[OutputFile]:
            workdir = ctx.scratch_dir / f"compress-{index}"
            workdir.mkdir(parents=True, exist_ok=True)
            original = item.path.stat().st_size
            reached: bool | None = None
            target_bytes = options.target_kb * 1024 if options.target_kb is not None else None
            if options.level == "custom" and target_bytes is not None:
                outcome, reached = search_target(item, ctx, target_bytes, workdir)
            else:
                path = workdir / "result.pdf"
                outcome = Outcome(path, compress_file(item, ctx, PROFILES[options.level], path))
            destination = ctx.output_path(pdf_name(f"{item.stem}-compressed", "compressed"))
            source = outcome.path if outcome.size < original else item.path
            shutil.copyfile(source, destination)
            ctx.report(
                (index + 1) / max(len(ctx.inputs), 1) * 0.95,
                describe_outcome(original, destination.stat().st_size, reached, target_bytes),
            )
            return [output_pdf(destination)]

        return run_each(ctx, handle, "Compressing file")
