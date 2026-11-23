from pathlib import Path

import pikepdf
import pytest

from app.text.bidi import logical_runs, paragraph_is_rtl, visual_runs
from app.text.fonts import FONT_KEYS, face_for, load_face
from app.text.geometry import (
    PageGeometry,
    anchor_center,
    mirrored,
    multiply,
    page_geometry,
    rotated_extent,
    stamp_matrix,
    tile_centers,
)
from app.text.overlay import OverlayDocument, TextStyle, parse_hex_color
from app.text.shaping import shape_line
from tests.pdf_factory import page_texts
from tests.qpdf_check import assert_qpdf_ok
from tests.text_fixtures import embedded_fonts, ink_box, make_geometry_pdf, pdfium_texts


def _apply(x: float, y: float, matrix: tuple[float, ...]) -> tuple[float, float]:
    a, b, c, d, e, f = matrix
    return (a * x + c * y + e, b * x + d * y + f)


def test_every_bundled_font_loads_with_bold() -> None:
    for key in FONT_KEYS:
        for bold in (False, True):
            face = load_face(key, bold)
            assert face.units_per_em > 0
            assert face.path.stat().st_size > 50_000
            assert (face.path.parent / "OFL.txt").is_file()


def test_fallback_picks_arabic_font_for_urdu() -> None:
    assert face_for("صفحہ", "inter", False, True).key == "noto-sans-arabic"
    assert face_for("Page", "inter", False, False).key == "inter"
    assert face_for("صفحہ", "noto-nastaliq-urdu", True, True).key == "noto-nastaliq-urdu"


def test_bidi_paragraph_direction() -> None:
    assert paragraph_is_rtl("صفحہ 3")
    assert not paragraph_is_rtl("Page 3")
    assert not paragraph_is_rtl("123")
    assert paragraph_is_rtl("123", "rtl")
    assert not paragraph_is_rtl("صفحہ", "ltr")


def test_bidi_splits_rtl_and_number_runs() -> None:
    rtl, runs = logical_runs("صفحہ 3 از 10")
    assert rtl
    assert [(run.text, run.rtl) for run in runs] == [
        ("صفحہ ", True),
        ("3", False),
        (" از ", True),
        ("10", False),
    ]
    assert [run.text for run in visual_runs("صفحہ 3 از 10")] == ["10", " از ", "3", "صفحہ "]


def test_bidi_keeps_separated_numbers_together() -> None:
    _, runs = logical_runs("صفحہ 1/3")
    assert [(run.text, run.rtl) for run in runs] == [("صفحہ ", True), ("1/3", False)]


def test_bidi_ltr_paragraph_with_embedded_rtl() -> None:
    order = [run.text for run in visual_runs("Page صفحہ 3 از 4 end")]
    assert order[0] == "Page "
    assert order[-1].endswith("end")
    assert "".join(order).count("صفحہ") == 1


def test_bidi_marks_follow_their_base() -> None:
    _, runs = logical_runs("بَ a")
    assert runs[0].text.startswith("بَ")
    assert runs[0].rtl


def test_shaping_joins_arabic_letters() -> None:
    line = shape_line("صفحہ", "noto-sans-arabic", False, 20)
    face = line.runs[0].face
    assert face.key == "noto-sans-arabic"
    isolated = {
        glyph.gid
        for char in "صفحہ"
        for glyph in shape_line(char, "noto-sans-arabic", False, 20).runs[0].glyphs
    }
    joined = {glyph.gid for glyph in line.runs[0].glyphs}
    assert joined - isolated
    assert line.width > 0


def test_shaping_reports_cluster_text_once() -> None:
    line = shape_line("office", "inter", False, 12)
    assert "".join(glyph.text for run in line.runs for glyph in run.glyphs) == "office"


@pytest.mark.parametrize(
    ("rotation", "corner"),
    [(0, (10.0, 20.0)), (90, (610.0, 20.0)), (180, (610.0, 420.0)), (270, (10.0, 420.0))],
)
def test_visual_origin_maps_to_visual_bottom_left(rotation: int, corner: tuple[float, float]) -> None:
    geometry = PageGeometry(10, 20, 600, 400, rotation)
    assert _apply(0, 0, geometry.visual_to_user()) == pytest.approx(corner)


def test_anchor_math_and_mirroring() -> None:
    assert anchor_center("bottom-left", 600, 800, 40, 10, 30, 20) == (50, 25)
    assert anchor_center("top-right", 600, 800, 40, 10, 30, 20) == (550, 775)
    assert anchor_center("middle-center", 600, 800, 40, 10, 30, 20, 5, -5) == (305, 395)
    assert mirrored("bottom-left") == "bottom-right"
    assert mirrored("top-center") == "top-center"


def test_rotated_extent_and_tiles_cover_page() -> None:
    assert rotated_extent(100, 20, 90) == pytest.approx((20, 100))
    centers = tile_centers(600, 800, 100, 20, 45, 50, 2500)
    xs = [x for x, _ in centers]
    ys = [y for _, y in centers]
    assert min(xs) <= 0 and max(xs) >= 600
    assert min(ys) <= 0 and max(ys) >= 800
    assert len(tile_centers(1e6, 1e6, 10, 10, 0, 0, 500)) <= 500


def test_stamp_matrix_composes_rotation() -> None:
    geometry = PageGeometry(0, 0, 400, 600, 90)
    matrix = stamp_matrix(geometry, (300, 200), 40, 10, 0)
    assert multiply(matrix, (1, 0, 0, 1, 0, 0)) == matrix
    assert _apply(20, 5, matrix) == pytest.approx(_apply(300, 200, geometry.visual_to_user()))


def test_page_geometry_uses_visible_area(tmp_path: Path) -> None:
    path = make_geometry_pdf(tmp_path / "geometry.pdf")
    with pikepdf.open(path) as pdf:
        assert page_geometry(pdf.pages[0]) == PageGeometry(0, 0, 400, 600, 0)
        assert page_geometry(pdf.pages[1]).visual_width == 600
        assert page_geometry(pdf.pages[4]) == PageGeometry(-100, -100, 300, 600, 0)
        assert page_geometry(pdf.pages[5]) == PageGeometry(1000, 2000, 500, 700, 90)


def test_parse_hex_color() -> None:
    assert parse_hex_color("#ff0000") == (1.0, 0.0, 0.0)
    assert parse_hex_color("0f0") == (0.0, 1.0, 0.0)
    with pytest.raises(ValueError):
        parse_hex_color("#12345")


def test_overlay_places_real_text_at_visual_corners(tmp_path: Path) -> None:
    path = make_geometry_pdf(tmp_path / "geometry.pdf")
    target = tmp_path / "stamped.pdf"
    with pikepdf.open(path) as pdf:
        overlay = OverlayDocument(pdf)
        style = TextStyle(font="noto-sans", size=28, bold=True)
        for page in pdf.pages:
            geometry = page_geometry(page)
            stamp = overlay.text_stamp("TL", style)
            center = anchor_center(
                "top-left", geometry.visual_width, geometry.visual_height, stamp.width, stamp.height, 10, 10
            )
            overlay.place(page, stamp, stamp_matrix(geometry, center, stamp.width, stamp.height, 0))
        overlay.finalize()
        pdf.save(target)
    assert_qpdf_ok(target)
    for index in range(6):
        box = ink_box(target, index)
        assert box is not None, index
        assert box[0] < 0.2 and box[1] < 0.2, (index, box)
        assert box[2] < 0.4 and box[3] < 0.3, (index, box)
    assert all("TL" in text for text in page_texts(target))
    fonts = embedded_fonts(target)
    assert len(fonts) == 1
    name, size = next(iter(fonts.items()))
    assert "+NotoSans-Bold" in name
    assert size < load_face("noto-sans", True).path.stat().st_size / 4


def test_overlay_is_upright_on_rotated_pages(tmp_path: Path) -> None:
    path = make_geometry_pdf(tmp_path / "geometry.pdf")
    target = tmp_path / "upright.pdf"
    with pikepdf.open(path) as pdf:
        overlay = OverlayDocument(pdf)
        stamp = overlay.text_stamp("WIDE TEXT LINE", TextStyle(font="inter", size=30))
        for page in pdf.pages:
            geometry = page_geometry(page)
            center = (geometry.visual_width / 2, geometry.visual_height / 2)
            overlay.place(page, stamp, stamp_matrix(geometry, center, stamp.width, stamp.height, 0))
        overlay.finalize()
        pdf.save(target)
    for index in range(6):
        box = ink_box(target, index)
        assert box is not None
        import pypdfium2 as pdfium

        document = pdfium.PdfDocument(str(target))
        width, height = document[index].get_size()
        document.close()
        ink_width = (box[2] - box[0]) * width
        ink_height = (box[3] - box[1]) * height
        assert ink_width > ink_height * 4, (index, ink_width, ink_height)


def test_urdu_text_is_embedded_and_extractable(tmp_path: Path) -> None:
    target = tmp_path / "urdu.pdf"
    with pikepdf.new() as pdf:
        pdf.add_blank_page(page_size=(595, 842))
        overlay = OverlayDocument(pdf)
        stamp = overlay.text_stamp("صفحہ ۳", TextStyle(font="noto-nastaliq-urdu", size=30))
        geometry = page_geometry(pdf.pages[0])
        overlay.place(pdf.pages[0], stamp, stamp_matrix(geometry, (300, 400), stamp.width, stamp.height, 0))
        overlay.finalize()
        pdf.save(target)
    assert_qpdf_ok(target)
    assert any("NotoNastaliqUrdu" in name for name in embedded_fonts(target))
    text = pdfium_texts(target)[0]
    assert "صفحہ" in text and "۳" in text
    assert ink_box(target, 0) is not None


def test_overlay_handles_inherited_resources_and_missing_contents(tmp_path: Path) -> None:
    from tests.text_fixtures import make_inherited_pdf

    path = make_inherited_pdf(tmp_path / "inherited.pdf")
    target = tmp_path / "inherited-out.pdf"
    with pikepdf.open(path) as pdf:
        overlay = OverlayDocument(pdf)
        stamp = overlay.text_stamp("Hi", TextStyle(font="noto-serif", size=20))
        for page in pdf.pages:
            geometry = page_geometry(page)
            assert geometry.rotation == 180
            center = anchor_center("bottom-right", 300, 400, stamp.width, stamp.height, 10, 10)
            overlay.place(page, stamp, stamp_matrix(geometry, center, stamp.width, stamp.height, 0))
        overlay.finalize()
        pdf.save(target)
    assert_qpdf_ok(target)
    box = ink_box(target, 1)
    assert box is not None and box[2] > 0.8 and box[3] > 0.8
