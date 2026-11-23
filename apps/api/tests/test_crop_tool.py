from pathlib import Path
from typing import Any

import pikepdf
import pytest
from hypothesis import given
from hypothesis import strategies as st
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.tools.base import InputFile, InputFileInfo, JobContext
from app.tools.edit.crop import CropTool
from app.tools.edit.crop_math import (
    Box,
    CropGeometryError,
    Margins,
    crop_box,
    display_size,
    display_to_pdf_margins,
    from_points,
    pdf_to_display_margins,
    pixel_bounds_to_margins,
    to_points,
)
from app.tools.registry import get_registry
from tests.pdf_factory import make_encrypted_pdf, make_pdf, page_texts
from tests.qpdf_check import assert_qpdf_ok


def _input(path: Path, password: str | None = None) -> InputFile:
    with pikepdf.open(path, password=password or "") as pdf:
        count = len(pdf.pages)
    return InputFile(
        path=path,
        original_name=path.name,
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=path.stat().st_size,
        page_count=count,
        password=password,
        encrypted=password is not None,
    )


def _run(tmp_path: Path, inputs: list[InputFile], **options: object) -> list[Any]:
    tool = CropTool()
    parsed = tool.parse_options(dict(options))
    tool.validate_inputs(
        [InputFileInfo(item.original_name, item.size_bytes, item.kind, item.page_count) for item in inputs],
        parsed,
    )
    ctx = JobContext(workdir=tmp_path / "work", inputs=inputs, options=parsed)
    ctx.scratch_dir.mkdir(parents=True, exist_ok=True)
    outputs = tool.run(ctx)
    for output in outputs:
        if output.mime_type == "application/pdf":
            assert_qpdf_ok(output.path)
    return outputs


def _boxes(path: Path, key: str) -> list[list[float]]:
    with pikepdf.open(path) as pdf:
        return [
            [round(float(value), 2) for value in page.obj[key]] if key in page.obj else []
            for page in pdf.pages
        ]


def _halves_pdf(path: Path, rotate: int, media: tuple[float, float, float, float] = (0, 0, 400, 600)) -> Path:
    x0, y0, x1, y1 = media
    middle = (x0 + x1) / 2
    with pikepdf.new() as pdf:
        pdf.add_blank_page(page_size=(400, 600))
        page = pdf.pages[0]
        page.obj.MediaBox = pikepdf.Array(list(media))
        stream = (
            f"1 0 0 rg {x0} {y0} {middle - x0} {y1 - y0} re f "
            f"0 0 1 rg {middle} {y0} {x1 - middle} {y1 - y0} re f"
        ).encode()
        page.obj.Contents = pdf.make_stream(stream)
        if rotate:
            page.obj.Rotate = rotate
        pdf.save(path)
    return path


def _render_colors(path: Path) -> set[tuple[int, int, int]]:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(path))
    try:
        image = document[0].render(scale=0.25).to_pil().convert("RGB")
    finally:
        document.close()
    inner = image.crop((2, 2, image.width - 2, image.height - 2))
    return {color for _, color in inner.getcolors(maxcolors=100000) or []}


def _wide_margin_pdf(path: Path, rotate: int = 0) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    document = canvas.Canvas(str(path), pagesize=A4)
    document.setFillColorRGB(0, 0, 0)
    document.rect(200, 300, 200, 200, stroke=0, fill=1)
    document.showPage()
    document.showPage()
    document.save()
    if rotate:
        with pikepdf.open(path, allow_overwriting_input=True) as pdf:
            pdf.pages[0].rotate(rotate, relative=False)
            pdf.save(path)
    return path


def test_crop_tool_is_registered() -> None:
    assert get_registry().get("crop").name == "Crop PDF"


def test_display_margins_follow_rotation() -> None:
    margins = Margins(top=1, right=2, bottom=3, left=4)
    assert display_to_pdf_margins(margins, 0) == margins
    assert display_to_pdf_margins(margins, 90) == Margins(top=2, right=3, bottom=4, left=1)
    assert display_to_pdf_margins(margins, 180) == Margins(top=3, right=4, bottom=1, left=2)
    assert display_to_pdf_margins(margins, -90) == Margins(top=4, right=1, bottom=2, left=3)
    with pytest.raises(CropGeometryError):
        display_to_pdf_margins(margins, 45)


@given(
    st.sampled_from([0, 90, 180, 270]),
    st.tuples(*[st.floats(min_value=0, max_value=1000, allow_nan=False) for _ in range(4)]),
)
def test_margin_mapping_round_trips(rotation: int, values: tuple[float, float, float, float]) -> None:
    margins = Margins(*values)
    assert pdf_to_display_margins(display_to_pdf_margins(margins, rotation), rotation) == margins


def test_crop_box_math_handles_origin_and_rotation() -> None:
    page = Box(100, 200, 500, 800)
    assert crop_box(page, Margins(10, 20, 30, 40), 0) == Box(140, 230, 480, 790)
    assert crop_box(page, Margins(10, 20, 30, 40), 90) == Box(110, 240, 470, 780)
    assert display_size(page, 90) == (600, 400)
    for bad in (Margins(300, 0, 300, 0), Margins(0, 400, 0, 0), Margins(-1, 0, 0, 0)):
        with pytest.raises(CropGeometryError):
            crop_box(page, bad, 0)


def test_units_and_pixel_bounds() -> None:
    assert to_points(25.4, "mm", 0) == pytest.approx(72)
    assert to_points(1, "in", 0) == 72
    assert to_points(10, "%", 500) == 50
    assert from_points(72, "mm", 0) == pytest.approx(25.4)
    assert from_points(50, "%", 500) == 10
    margins = pixel_bounds_to_margins((10, 20, 90, 180), (100, 200), (200, 400), 2)
    assert margins == Margins(top=38, right=18, bottom=38, left=18)


def test_crop_all_pages_visual(tmp_path: Path) -> None:
    source = _input(make_pdf(tmp_path / "doc.pdf", 3, "Crop"))
    output = _run(tmp_path, [source], margins={"top": 50, "right": 40, "bottom": 30, "left": 20})[0]
    assert output.filename == "doc-cropped.pdf"
    width, height = A4
    expected = [20.0, 30.0, round(width - 40, 2), round(height - 50, 2)]
    assert _boxes(output.path, "/CropBox") == [expected] * 3
    assert _boxes(output.path, "/MediaBox") == [[0.0, 0.0, round(width, 2), round(height, 2)]] * 3


def test_crop_single_page_and_ranges(tmp_path: Path) -> None:
    source = _input(make_pdf(tmp_path / "doc.pdf", 6, "Crop"))
    single = _run(tmp_path / "one", [source], margins={"top": 100}, pages="2")[0]
    assert [bool(box) for box in _boxes(single.path, "/CropBox")] == [False, True, False, False, False, False]
    ranged = _run(tmp_path / "range", [source], margins={"left": 10}, pages="1-2, 5-end")[0]
    assert [bool(box) for box in _boxes(ranged.path, "/CropBox")] == [True, True, False, False, True, True]
    even = _run(tmp_path / "even", [source], margins={"left": 10}, pages="even")[0]
    assert [bool(box) for box in _boxes(even.path, "/CropBox")] == [False, True, False, True, False, True]
    with pytest.raises(ToolInputError, match="outside"):
        _run(tmp_path / "bad", [source], margins={"left": 10}, pages="9")


def test_rotated_page_crops_the_visible_side(tmp_path: Path) -> None:
    source = _input(_halves_pdf(tmp_path / "rotated.pdf", 90))
    output = _run(tmp_path, [source], margins={"bottom": 200})[0]
    assert _boxes(output.path, "/CropBox") == [[0.0, 0.0, 200.0, 600.0]]
    assert _render_colors(output.path) == {(255, 0, 0)}
    flipped = _input(_halves_pdf(tmp_path / "flipped.pdf", 270))
    kept_blue = _run(tmp_path / "flip", [flipped], margins={"bottom": 200})[0]
    assert _boxes(kept_blue.path, "/CropBox") == [[200.0, 0.0, 400.0, 600.0]]
    assert _render_colors(kept_blue.path) == {(0, 0, 255)}


def test_offset_media_box_origin(tmp_path: Path) -> None:
    source = _input(_halves_pdf(tmp_path / "offset.pdf", 0, (100, 200, 500, 800)))
    output = _run(tmp_path, [source], margins={"right": 200, "top": 100}, mode="permanent")[0]
    for key in ("/MediaBox", "/CropBox", "/TrimBox", "/BleedBox", "/ArtBox"):
        assert _boxes(output.path, key) == [[100.0, 200.0, 300.0, 700.0]]
    assert _render_colors(output.path) == {(255, 0, 0)}


def _annotated_pdf(path: Path) -> Path:
    make_pdf(path.with_name("plain.pdf"), 1, "Note")
    with pikepdf.open(path.with_name("plain.pdf")) as pdf:
        page = pdf.pages[0]
        inside = pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Square, Rect=[100, 100, 200, 200]
            )
        )
        outside = pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Square, Rect=[400, 700, 500, 800]
            )
        )
        popup = pdf.make_indirect(
            pikepdf.Dictionary(Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Popup, Rect=[100, 100, 150, 150])
        )
        popup.Parent = outside
        page.obj.Annots = pdf.make_indirect(pikepdf.Array([inside, outside, popup]))
        pdf.save(path)
    return path


def test_visual_and_permanent_modes_differ(tmp_path: Path) -> None:
    source = _input(_annotated_pdf(tmp_path / "notes.pdf"))
    margins = {"top": 200, "right": 250}
    visual = _run(tmp_path / "visual", [source], margins=margins, mode="visual")[0]
    permanent = _run(tmp_path / "permanent", [source], margins=margins, mode="permanent")[0]
    with pikepdf.open(source.path) as original, pikepdf.open(visual.path) as soft:
        assert soft.pages[0].mediabox == original.pages[0].mediabox
        assert len(soft.pages[0].Annots) == 3
        assert soft.pages[0].obj.Contents.read_bytes() == original.pages[0].obj.Contents.read_bytes()
        assert "/TrimBox" not in soft.pages[0].obj
    with pikepdf.open(permanent.path) as hard:
        page = hard.pages[0]
        width, height = A4
        assert [round(float(value), 2) for value in page.mediabox] == [
            0,
            0,
            round(width - 250, 2),
            round(height - 200, 2),
        ]
        assert [annot.Subtype for annot in page.Annots] == [pikepdf.Name.Square]
        streams = [stream.read_bytes() for stream in page.obj.Contents]
        assert streams[0].startswith(b"q 0 0 345.2756 641.8898 re W n")
        assert streams[-1].strip() == b"Q"
    assert "Note page 1" in page_texts(visual.path)[0]
    assert "Note page 1" in page_texts(permanent.path)[0]


def test_auto_bounds_on_wide_margins(tmp_path: Path) -> None:
    source = _input(_wide_margin_pdf(tmp_path / "wide.pdf"))
    output = _run(tmp_path, [source], auto=True, padding=0)[0]
    boxes = _boxes(output.path, "/CropBox")
    assert boxes[0] == pytest.approx([200, 300, 400, 500], abs=3)
    assert boxes[1] == []
    rotated = _input(_wide_margin_pdf(tmp_path / "turned.pdf", 90))
    turned = _run(tmp_path / "turned", [rotated], auto=True, padding=10, mode="permanent")[0]
    assert _boxes(turned.path, "/MediaBox")[0] == pytest.approx([190, 290, 410, 510], abs=3)


def test_invalid_crops_are_rejected(tmp_path: Path) -> None:
    source = _input(make_pdf(tmp_path / "doc.pdf", 1, "Bad"))
    with pytest.raises(ToolInputError, match="Invalid options"):
        _run(tmp_path / "zero", [source])
    with pytest.raises(ToolInputError, match="Invalid options"):
        _run(tmp_path / "negative", [source], margins={"top": -5})
    with pytest.raises(ToolInputError, match="empty on page 1"):
        _run(tmp_path / "huge", [source], margins={"top": 500, "bottom": 400})
    with pytest.raises(ToolInputError, match="empty on page 1"):
        _run(tmp_path / "wide", [source], margins={"left": 5000})
    with pytest.raises(ToolInputError, match="Invalid options"):
        _run(tmp_path / "mode", [source], margins={"top": 5}, mode="erase")


def test_batch_and_encrypted_inputs(tmp_path: Path) -> None:
    first = _input(make_pdf(tmp_path / "a.pdf", 2, "A"))
    locked = _input(make_encrypted_pdf(tmp_path / "b.pdf", "pw-123456"), password="pw-123456")
    outputs = _run(tmp_path, [first, locked], auto=True)
    assert sorted(output.filename for output in outputs) == ["a-cropped.pdf", "b-cropped.pdf"]
    for output in outputs:
        assert all(_boxes(output.path, "/CropBox"))
