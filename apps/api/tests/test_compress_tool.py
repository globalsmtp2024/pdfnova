import io
import zipfile
from pathlib import Path
from typing import Any

import pikepdf
import pytest
from PIL import Image, ImageChops, ImageStat
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.jobs.engine import build_zip
from app.tools.base import InputFile, InputFileInfo, JobContext, ToolFailedError
from app.tools.optimize.compress import CompressTool, deduplicate_streams, describe_outcome
from app.tools.registry import get_registry
from tests.pdf_factory import make_pdf, page_texts
from tests.qpdf_check import assert_qpdf_ok


def noisy_photo(width: int, height: int, seed: int, alpha: bool = False) -> Image.Image:
    channels = [
        Image.blend(
            Image.effect_noise((width, height), 40 + seed * 3 + offset * 7),
            Image.linear_gradient("L").resize((width, height)).rotate(90 * offset),
            0.55,
        )
        for offset in range(3)
    ]
    picture = Image.merge("RGB", channels)
    if alpha:
        mask = Image.radial_gradient("L").resize((width, height))
        picture.putalpha(Image.eval(mask, lambda value: 255 - value))
    return picture


def make_photo_pdf(path: Path, pages: int = 2, pixels: int = 1600, jpeg: bool = False) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    document = canvas.Canvas(str(path), pagesize=A4)
    for number in range(pages):
        picture = noisy_photo(pixels, pixels * 3 // 4, number)
        if jpeg:
            buffer = io.BytesIO()
            picture.save(buffer, format="JPEG", quality=95)
            buffer.seek(0)
            source = ImageReader(buffer)
        else:
            source = ImageReader(picture)
        document.drawImage(source, 50, 250, width=495, height=371)
        document.setFont("Helvetica", 14)
        document.drawString(72, 780, f"Holiday photo page {number + 1}")
        document.showPage()
    document.save()
    return path


def make_transparent_pdf(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    document = canvas.Canvas(str(path), pagesize=A4)
    document.setFillColorRGB(0.1, 0.4, 0.9)
    document.rect(0, 0, 595, 842, fill=1, stroke=0)
    document.drawImage(ImageReader(noisy_photo(1800, 1800, 3, alpha=True)), 60, 200, 470, 470, mask="auto")
    document.setFillColorRGB(0, 0, 0)
    document.drawString(72, 780, "Transparent overlay")
    document.showPage()
    document.save()
    return path


def _input(path: Path, name: str | None = None) -> InputFile:
    with pikepdf.open(path) as pdf:
        count = len(pdf.pages)
    return InputFile(
        path=path,
        original_name=name or path.name,
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=path.stat().st_size,
        page_count=count,
    )


def _run(tmp_path: Path, inputs: list[InputFile], **options: object) -> list[Any]:
    tool = CompressTool()
    parsed = tool.parse_options(dict(options))
    tool.validate_inputs(
        [InputFileInfo(item.original_name, item.size_bytes, item.kind, item.page_count) for item in inputs],
        parsed,
    )
    labels: list[str] = []
    ctx = JobContext(
        workdir=tmp_path / "work",
        inputs=inputs,
        options=parsed,
        reporter=lambda _fraction, label: labels.append(label),
    )
    outputs = tool.run(ctx)
    for output in outputs:
        if output.mime_type == "application/pdf":
            assert_qpdf_ok(output.path)
    return outputs


def _render(path: Path, scale: float = 0.25) -> list[Image.Image]:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(path))
    try:
        return [document[index].render(scale=scale).to_pil().convert("RGB") for index in range(len(document))]
    finally:
        document.close()


def _difference(first: Image.Image, second: Image.Image) -> float:
    small = (first.width // 2, first.height // 2)
    delta = ImageChops.difference(first.resize(small), second.resize(small))
    return float(sum(ImageStat.Stat(delta).mean) / 3)


def _assert_looks_same(original: Path, result: Path, tolerance: float) -> None:
    before, after = _render(original), _render(result)
    assert len(before) == len(after)
    for left, right in zip(before, after, strict=True):
        assert left.size == right.size
        assert _difference(left, right) < tolerance


@pytest.fixture
def photos(fixtures_dir: Path) -> InputFile:
    return _input(make_photo_pdf(fixtures_dir / "photos.pdf"))


def test_registered_as_optimize_tool() -> None:
    tool = get_registry().get("compress")
    assert tool.category.value == "optimize"


@pytest.mark.parametrize(("level", "minimum_saving"), [("recommended", 0.5), ("extreme", 0.75)])
def test_levels_shrink_image_heavy_pdf(
    tmp_path: Path, photos: InputFile, level: str, minimum_saving: float
) -> None:
    output = _run(tmp_path, [photos], level=level)[0]
    size = output.path.stat().st_size
    assert size < photos.size_bytes * (1 - minimum_saving)
    assert output.filename == "photos-compressed.pdf"
    assert [text.strip() for text in page_texts(output.path)] == [
        "Holiday photo page 1",
        "Holiday photo page 2",
    ]
    _assert_looks_same(photos.path, output.path, 12.0)


def test_extreme_is_smaller_than_low(tmp_path: Path, photos: InputFile) -> None:
    low = _run(tmp_path / "low", [photos], level="low")[0].path.stat().st_size
    extreme = _run(tmp_path / "extreme", [photos], level="extreme")[0].path.stat().st_size
    assert extreme < low <= photos.size_bytes


def test_images_downsampled_to_placement_dpi(tmp_path: Path, photos: InputFile) -> None:
    output = _run(tmp_path, [photos], level="recommended")[0]
    with pikepdf.open(output.path) as pdf:
        image = next(iter(pdf.pages[0].images.values()))
        width_inches = 495 / 72
        assert int(image.Width) == pytest.approx(150 * width_inches, rel=0.02)
        assert image.Filter == pikepdf.Name.DCTDecode


def test_jpeg_input_recompressed(tmp_path: Path, fixtures_dir: Path) -> None:
    source = _input(make_photo_pdf(fixtures_dir / "jpeg.pdf", pages=1, jpeg=True))
    output = _run(tmp_path, [source], level="recommended")[0]
    assert output.path.stat().st_size < source.size_bytes * 0.7
    _assert_looks_same(source.path, output.path, 12.0)


def test_small_text_pdf_is_never_larger(tmp_path: Path, fixtures_dir: Path) -> None:
    source = _input(make_pdf(fixtures_dir / "text.pdf", 1, "Plain"))
    output = _run(tmp_path, [source], level="extreme")[0]
    assert output.path.stat().st_size <= source.size_bytes
    if output.path.stat().st_size == source.size_bytes:
        assert output.path.read_bytes() == source.path.read_bytes()
    assert "Plain page 1" in page_texts(output.path)[0]


def test_already_optimized_returns_original_bytes(tmp_path: Path, photos: InputFile) -> None:
    once = _run(tmp_path / "first", [photos], level="extreme")[0]
    again = _run(tmp_path / "second", [_input(once.path, "again.pdf")], level="extreme")[0]
    assert again.path.read_bytes() == once.path.read_bytes()
    assert describe_outcome(100, 100, None, None).startswith("Already optimized")


def test_soft_mask_transparency_preserved(tmp_path: Path, fixtures_dir: Path) -> None:
    source = _input(make_transparent_pdf(fixtures_dir / "alpha.pdf"))
    output = _run(tmp_path, [source], level="recommended")[0]
    assert output.path.stat().st_size < source.size_bytes
    with pikepdf.open(output.path) as pdf:
        image = next(iter(pdf.pages[0].images.values()))
        assert isinstance(image.get("/SMask"), pikepdf.Stream)
        assert image.ColorSpace == pikepdf.Name.DeviceRGB
    _assert_looks_same(source.path, output.path, 12.0)


def test_grayscale_option(tmp_path: Path, photos: InputFile) -> None:
    output = _run(tmp_path, [photos], level="recommended", grayscale=True)[0]
    with pikepdf.open(output.path) as pdf:
        for page in pdf.pages:
            for image in page.images.values():
                assert image.ColorSpace == pikepdf.Name.DeviceGray
    rendered = _render(output.path)[0]
    red, _green, blue = rendered.split()
    assert ImageStat.Stat(ImageChops.difference(red, blue)).mean[0] < 3


def test_strip_metadata_and_thumbnails(tmp_path: Path, fixtures_dir: Path) -> None:
    source_path = make_photo_pdf(fixtures_dir / "meta.pdf", pages=1, pixels=600)
    with pikepdf.open(source_path, allow_overwriting_input=True) as pdf:
        pdf.docinfo["/Author"] = "Someone"
        with pdf.open_metadata() as meta:
            meta["dc:title"] = "Secret"
        thumb = pikepdf.Stream(pdf, b"\x00" * 300)
        pdf.pages[0].obj.Thumb = pdf.make_indirect(thumb)
        pdf.save(source_path)
    output = _run(tmp_path, [_input(source_path)], level="low", strip_metadata=True)[0]
    with pikepdf.open(output.path) as pdf:
        assert "/Thumb" not in pdf.pages[0].obj
        assert "/Metadata" not in pdf.Root
        assert "/Author" not in pdf.docinfo


def test_duplicate_images_are_merged(tmp_path: Path, fixtures_dir: Path) -> None:
    path = fixtures_dir / "dupes.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    picture = noisy_photo(500, 400, 1)
    with pikepdf.new() as pdf:
        for _ in range(3):
            pdf.add_blank_page(page_size=(400, 300))
            image = pikepdf.Stream(pdf, picture.tobytes())
            image.Type = pikepdf.Name.XObject
            image.Subtype = pikepdf.Name.Image
            image.Width, image.Height = 500, 400
            image.ColorSpace = pikepdf.Name.DeviceRGB
            image.BitsPerComponent = 8
            page = pdf.pages[-1]
            page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im0=pdf.make_indirect(image)))
            page.Contents = pdf.make_stream(b"q 400 0 0 300 0 0 cm /Im0 Do Q")
        assert deduplicate_streams(pdf) == 2
        pdf.save(path)
    output = _run(tmp_path, [_input(path)], level="low")[0]
    with pikepdf.open(output.path) as pdf:
        ids = {next(iter(page.images.values())).objgen for page in pdf.pages}
        assert len(ids) == 1


def test_custom_target_reached(tmp_path: Path, photos: InputFile) -> None:
    target_kb = photos.size_bytes // 1024 // 8
    output = _run(tmp_path, [photos], level="custom", target_kb=target_kb)[0]
    assert output.path.stat().st_size <= target_kb * 1024
    _assert_looks_same(photos.path, output.path, 16.0)


def test_custom_target_unreachable_returns_smallest(tmp_path: Path, photos: InputFile) -> None:
    output = _run(tmp_path, [photos], level="custom", target_kb=1)[0]
    size = output.path.stat().st_size
    assert 1024 < size < photos.size_bytes
    assert describe_outcome(photos.size_bytes, size, False, 1024).startswith("Target size not reachable")


def test_custom_requires_target() -> None:
    with pytest.raises(ToolInputError):
        CompressTool().parse_options({"level": "custom"})


def test_batch_partial_failure(tmp_path: Path, photos: InputFile, fixtures_dir: Path) -> None:
    broken_path = fixtures_dir / "broken.pdf"
    broken_path.write_bytes(b"%PDF-1.7\nnot really a pdf")
    broken = InputFile(
        path=broken_path,
        original_name="broken.pdf",
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=broken_path.stat().st_size,
        page_count=1,
    )
    outputs = _run(tmp_path, [photos, broken], level="recommended")
    assert [output.filename for output in outputs] == ["photos-compressed.pdf", "processing-report.txt"]
    assert "broken.pdf" in outputs[1].path.read_text(encoding="utf-8")
    archive = build_zip(outputs, [output.filename for output in outputs], tmp_path / "bundle.zip")
    with zipfile.ZipFile(archive) as bundle:
        assert sorted(bundle.namelist()) == ["photos-compressed.pdf", "processing-report.txt"]


def test_single_broken_file_fails(tmp_path: Path, fixtures_dir: Path) -> None:
    broken_path = fixtures_dir / "broken-only.pdf"
    broken_path.write_bytes(b"%PDF-1.7\ngarbage")
    broken = InputFile(
        path=broken_path,
        original_name="broken-only.pdf",
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=broken_path.stat().st_size,
        page_count=1,
    )
    with pytest.raises(ToolFailedError):
        _run(tmp_path, [broken], level="recommended")


def test_cmyk_image_keeps_colours(tmp_path: Path, fixtures_dir: Path) -> None:
    path = fixtures_dir / "cmyk.pdf"
    picture = noisy_photo(1600, 1200, 2).convert("CMYK")
    with pikepdf.new() as pdf:
        pdf.add_blank_page(page_size=(400, 300))
        image = pikepdf.Stream(pdf, picture.tobytes())
        image.Type = pikepdf.Name.XObject
        image.Subtype = pikepdf.Name.Image
        image.Width, image.Height = picture.size
        image.ColorSpace = pikepdf.Name.DeviceCMYK
        image.BitsPerComponent = 8
        page = pdf.pages[0]
        page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im0=pdf.make_indirect(image)))
        page.Contents = pdf.make_stream(b"q 400 0 0 300 0 0 cm /Im0 Do Q")
        pdf.save(path)
    source = _input(path)
    output = _run(tmp_path, [source], level="recommended")[0]
    assert output.path.stat().st_size < source.size_bytes * 0.5
    with pikepdf.open(output.path) as pdf:
        assert next(iter(pdf.pages[0].images.values())).ColorSpace == pikepdf.Name.DeviceCMYK
    _assert_looks_same(source.path, output.path, 12.0)
