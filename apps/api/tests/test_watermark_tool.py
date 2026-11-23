import base64
import io
from pathlib import Path

import pikepdf
import pytest
from PIL import Image

from app.core.errors import ToolInputError
from app.text.images import MAX_IMAGE_PIXELS, check_image, prepare_image
from app.tools.edit.watermark import WatermarkTool
from app.tools.registry import get_registry
from tests.pdf_factory import make_mixed_pdf, make_pdf, page_texts
from tests.text_fixtures import as_input, ink_box, make_geometry_pdf, pdfium_texts, run_tool


def _png(width: int = 40, height: int = 20, alpha: bool = True) -> str:
    buffer = io.BytesIO()
    mode = "RGBA" if alpha else "RGB"
    color = (20, 40, 200, 128) if alpha else (20, 40, 200)
    Image.new(mode, (width, height), color).save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _jpeg() -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (60, 30), (10, 10, 10)).save(buffer, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _states(path: Path) -> list[float]:
    with pikepdf.open(path) as pdf:
        return [
            float(obj.ca)
            for obj in pdf.objects
            if isinstance(obj, pikepdf.Dictionary) and obj.get("/Type") == pikepdf.Name.ExtGState
        ]


def _xobject_count(path: Path, subtype: str) -> int:
    with pikepdf.open(path) as pdf:
        return sum(
            1
            for obj in pdf.objects
            if isinstance(obj, pikepdf.Stream) and obj.get("/Subtype") == pikepdf.Name(subtype)
        )


def test_registered() -> None:
    assert "watermark" in get_registry()


def test_single_text_watermark_with_opacity(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "doc.pdf", 3, "Doc"))
    output = run_tool(WatermarkTool(), tmp_path, [source], text="DRAFT", opacity=0.4, rotation=30)[0]
    assert output.filename == "doc-watermarked.pdf"
    assert all("DRAFT" in text for text in page_texts(output.path))
    assert 0.4 in _states(output.path)
    box = ink_box(output.path, 0, threshold=250)
    assert box is not None


def test_multiline_text(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "doc.pdf", 1, "Doc"))
    output = run_tool(WatermarkTool(), tmp_path, [source], text="  TOP SECRET \n do not copy ", rotation=0)[0]
    text = page_texts(output.path)[0]
    assert "TOP SECRET" in text and "do not copy" in text


def test_tiled_watermark_reuses_one_stamp(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "doc.pdf", 4, "Doc"))
    output = run_tool(
        WatermarkTool(), tmp_path, [source], text="CONFIDENTIAL", layout="tiled", size=24, spacing=40
    )[0]
    texts = page_texts(output.path)
    assert all(text.count("CONFIDENTIAL") >= 4 for text in texts)
    assert _xobject_count(output.path, "/Form") == 2


def test_under_content_is_drawn_first(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "doc.pdf", 1, "Doc"))
    output = run_tool(WatermarkTool(), tmp_path, [source], text="BEHIND", layer="under")[0]
    with pikepdf.open(output.path) as pdf:
        page = pdf.pages[0]
        operations = pikepdf.parse_content_stream(page)
        names = [str(op.operator) for op in operations]
        first_do = names.index("Do")
        first_text = names.index("BT")
        assert first_do < first_text
    over = run_tool(WatermarkTool(), tmp_path / "over", [source], text="FRONT", layer="over")[0]
    with pikepdf.open(over.path) as pdf:
        names = [str(op.operator) for op in pikepdf.parse_content_stream(pdf.pages[0])]
        assert names.index("BT") < names.index("Do")


def test_under_content_hidden_by_opaque_page(tmp_path: Path) -> None:
    from reportlab.pdfgen import canvas

    path = tmp_path / "opaque.pdf"
    pdf = canvas.Canvas(str(path), pagesize=(300, 300))
    pdf.setFillColorRGB(1, 1, 1)
    pdf.rect(0, 0, 300, 300, fill=1, stroke=0)
    pdf.showPage()
    pdf.save()
    source = as_input(path)
    under = run_tool(WatermarkTool(), tmp_path / "u", [source], text="HIDDEN", layer="under", opacity=1)[0]
    over = run_tool(WatermarkTool(), tmp_path / "o", [source], text="SHOWN", layer="over", opacity=1)[0]
    assert ink_box(under.path, 0) is None
    assert ink_box(over.path, 0) is not None


def test_rotated_pages_keep_watermark_centered(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_geometry_pdf(fixtures_dir / "geometry.pdf"))
    output = run_tool(WatermarkTool(), tmp_path, [source], text="MID", rotation=0, opacity=1, size=40)[0]
    for index in range(6):
        box = ink_box(output.path, index)
        assert box is not None
        center_x = (box[0] + box[2]) / 2
        center_y = (box[1] + box[3]) / 2
        assert abs(center_x - 0.5) < 0.05 and abs(center_y - 0.5) < 0.05, (index, box)
        assert box[2] - box[0] > box[3] - box[1]


def test_position_offsets_and_margin(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_mixed_pdf(fixtures_dir / "mixed.pdf"))
    output = run_tool(
        WatermarkTool(),
        tmp_path,
        [source],
        text="X",
        rotation=0,
        opacity=1,
        position="bottom-left",
        margin=0,
        offset_x=20,
        offset_y=20,
        pages="2",
    )[0]
    box = ink_box(output.path, 1, threshold=128)
    assert box is not None
    assert box[3] > 0.9


def test_urdu_watermark_extracts(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "doc.pdf", 1, "Doc"))
    output = run_tool(WatermarkTool(), tmp_path, [source], text="خفیہ دستاویز", font="noto-nastaliq-urdu")[0]
    assert "خفیہ" in pdfium_texts(output.path)[0]


def test_image_watermark_png_with_alpha(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "doc.pdf", 2, "Doc"))
    output = run_tool(
        WatermarkTool(), tmp_path, [source], mode="image", image_data=_png(), opacity=0.7, image_scale=50
    )[0]
    with pikepdf.open(output.path) as pdf:
        images = [
            obj
            for obj in pdf.objects
            if isinstance(obj, pikepdf.Stream) and obj.get("/Subtype") == pikepdf.Name.Image
        ]
        main = [image for image in images if "/SMask" in image]
        assert len(main) == 1
    assert 0.7 in _states(output.path)
    assert ink_box(output.path, 0, threshold=230) is not None


def test_image_watermark_jpeg_tiled_under(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "doc.pdf", 2, "Doc"))
    output = run_tool(
        WatermarkTool(),
        tmp_path,
        [source],
        mode="image",
        image_data=_jpeg(),
        layout="tiled",
        image_scale=10,
        layer="under",
    )[0]
    with pikepdf.open(output.path) as pdf:
        images = [
            obj
            for obj in pdf.objects
            if isinstance(obj, pikepdf.Stream) and obj.get("/Subtype") == pikepdf.Name.Image
        ]
        assert len(images) == 1
        assert images[0].Filter == pikepdf.Name.DCTDecode


def test_image_validation(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "doc.pdf", 1, "Doc"))
    svg = base64.b64encode(b"<svg xmlns='http://www.w3.org/2000/svg'></svg>").decode("ascii")
    with pytest.raises(ToolInputError, match="SVG"):
        run_tool(WatermarkTool(), tmp_path, [source], mode="image", image_data=svg)
    with pytest.raises(ToolInputError, match="SVG"):
        run_tool(
            WatermarkTool(), tmp_path, [source], mode="image", image_data="data:image/svg+xml;base64,AAAA"
        )
    gif = io.BytesIO()
    Image.new("RGB", (4, 4)).save(gif, format="GIF")
    with pytest.raises(ToolInputError, match="PNG or JPG"):
        run_tool(
            WatermarkTool(),
            tmp_path,
            [source],
            mode="image",
            image_data=base64.b64encode(gif.getvalue()).decode("ascii"),
        )
    with pytest.raises(ToolInputError):
        run_tool(WatermarkTool(), tmp_path, [source], mode="image", image_data="not base64!!")
    with pytest.raises(ToolInputError):
        run_tool(WatermarkTool(), tmp_path, [source], mode="image")
    with pytest.raises(ToolInputError):
        run_tool(WatermarkTool(), tmp_path, [source], text="   ")


def test_pixel_limit() -> None:
    side = int(MAX_IMAGE_PIXELS**0.5) + 10
    buffer = io.BytesIO()
    Image.new("1", (side, side)).save(buffer, format="PNG")
    with pytest.raises(ToolInputError, match="too many pixels"):
        check_image(buffer.getvalue())
    prepared = prepare_image(base64.b64decode(_png(alpha=False)))
    assert prepared.alpha is None and prepared.filter == "/FlateDecode"


def test_page_selection_rules(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "doc.pdf", 5, "Doc"))
    output = run_tool(WatermarkTool(), tmp_path, [source], text="MARK", parity="odd", skip_first=True)[0]
    marked = ["MARK" in text for text in page_texts(output.path)]
    assert marked == [False, False, True, False, True]


def test_very_large_page_tiles_are_bounded(tmp_path: Path) -> None:
    path = tmp_path / "huge.pdf"
    with pikepdf.new() as pdf:
        pdf.add_blank_page(page_size=(14400, 14400))
        pdf.save(path)
    output = run_tool(
        WatermarkTool(), tmp_path, [as_input(path)], text="BIG", layout="tiled", size=6, spacing=0
    )[0]
    with pikepdf.open(output.path) as pdf:
        groups = [
            obj
            for obj in pdf.objects
            if isinstance(obj, pikepdf.Stream)
            and obj.get("/Subtype") == pikepdf.Name.Form
            and "/XObject" in obj.Resources
        ]
        assert groups
        assert groups[0].read_bytes().count(b" Do ") <= 2500


def test_batch_watermarks_each_file(tmp_path: Path, fixtures_dir: Path) -> None:
    first = as_input(make_pdf(fixtures_dir / "a.pdf", 1, "A"))
    second = as_input(make_pdf(fixtures_dir / "b.pdf", 2, "B"))
    outputs = run_tool(WatermarkTool(), tmp_path, [first, second], text="COPY")
    assert [output.filename for output in outputs] == ["a-watermarked.pdf", "b-watermarked.pdf"]
    assert all("COPY" in text for text in page_texts(outputs[1].path))
