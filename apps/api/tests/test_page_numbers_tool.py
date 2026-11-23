import zipfile
from pathlib import Path

import pikepdf
import pytest

from app.core.errors import ToolInputError
from app.tools.edit.page_numbers import (
    PageNumbersOptions,
    PageNumbersTool,
    format_number,
    numbered_pages,
    to_letters,
    to_roman,
)
from app.tools.registry import get_registry
from tests.pdf_factory import make_mixed_pdf, make_pdf, page_texts
from tests.text_fixtures import as_input, embedded_fonts, ink_box, make_geometry_pdf, pdfium_texts, run_tool


def _last_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def test_registered() -> None:
    assert "page-numbers" in get_registry()


def test_number_styles() -> None:
    assert to_roman(1994) == "MCMXCIV"
    assert to_roman(0) == "0"
    assert to_letters(1) == "A"
    assert to_letters(27) == "AA"
    assert to_letters(52) == "AZ"
    assert format_number(4, "roman_lower", "western") == "iv"
    assert format_number(28, "letters_lower", "western") == "ab"
    assert format_number(120, "decimal", "arabic_indic") == "١٢٠"
    assert format_number(45, "decimal", "extended_arabic_indic") == "۴۵"


def test_skip_rules_and_numbering() -> None:
    options = PageNumbersOptions(start_number=5, skip_first=1, skip_last=1)
    assert numbered_pages(options, 5) == [(1, 5, 7), (2, 6, 7), (3, 7, 7)]
    odd = PageNumbersOptions(parity="odd", first_page=2)
    assert [index for index, _, _ in numbered_pages(odd, 6)] == [2, 4]
    ranged = PageNumbersOptions(pages="2-4, !3")
    assert numbered_pages(ranged, 6) == [(1, 1, 3), (3, 3, 3)]


def test_template_validation() -> None:
    tool = PageNumbersTool()
    with pytest.raises(ToolInputError):
        tool.parse_options({"format": "custom", "template": "{x}"})
    with pytest.raises(ToolInputError):
        tool.parse_options({"format": "custom", "template": "no number"})
    with pytest.raises(ToolInputError):
        tool.parse_options({"color": "red"})


def test_page_n_of_total_bottom_center(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "three.pdf", 3, "Doc"))
    output = run_tool(PageNumbersTool(), tmp_path, [source], format="page_n_of_total")[0]
    assert output.filename == "three-numbered.pdf"
    texts = page_texts(output.path)
    assert [_last_line(text) for text in texts] == ["Page 1 of 3", "Page 2 of 3", "Page 3 of 3"]
    box = ink_box(output.path, 1, threshold=128)
    assert box is not None
    assert box[3] > 0.9


def test_rotated_and_offset_pages_get_upright_labels(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_geometry_pdf(fixtures_dir / "geometry.pdf"))
    output = run_tool(
        PageNumbersTool(), tmp_path, [source], position="bottom-right", size=20, margin_x=10, margin_y=10
    )[0]
    for index in range(6):
        box = ink_box(output.path, index)
        assert box is not None, index
        assert box[0] > 0.75 and box[1] > 0.85, (index, box)
    assert [_last_line(text) for text in page_texts(output.path)] == ["1", "2", "3", "4", "5", "6"]


def test_mixed_sizes_mm_margins_and_mirror(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_mixed_pdf(fixtures_dir / "mixed.pdf"))
    output = run_tool(
        PageNumbersTool(),
        tmp_path,
        [source],
        position="top-left",
        unit="mm",
        margin_x=10,
        margin_y=10,
        mirror=True,
        size=14,
        format="n_of_total",
    )[0]
    first = ink_box(output.path, 0, threshold=128)
    second = ink_box(output.path, 1, threshold=128)
    third = ink_box(output.path, 2, threshold=128)
    assert first is not None and second is not None and third is not None
    assert second[2] > 0.85
    assert third[0] < 0.1
    texts = page_texts(output.path)
    assert "3 / 3" in texts[2]


def test_roman_letters_custom_and_style(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "four.pdf", 4, "Doc"))
    roman = run_tool(PageNumbersTool(), tmp_path / "a", [source], style="roman_upper", start_number=3)[0]
    assert [_last_line(text) for text in page_texts(roman.path)] == ["III", "IV", "V", "VI"]
    letters = run_tool(
        PageNumbersTool(),
        tmp_path / "b",
        [source],
        style="letters_lower",
        format="custom",
        template="({n} of {total})",
        font="noto-serif",
        bold=True,
        color="#336699",
        opacity=0.5,
    )[0]
    assert [_last_line(text) for text in page_texts(letters.path)][-1] == "(d of d)"
    with pikepdf.open(letters.path) as pdf:
        states = [
            obj
            for obj in pdf.objects
            if isinstance(obj, pikepdf.Dictionary) and obj.get("/Type") == pikepdf.Name.ExtGState
        ]
        assert any(float(state.ca) == 0.5 for state in states)
    assert any("NotoSerif-Bold" in name for name in embedded_fonts(letters.path))


def test_urdu_label_with_extended_digits(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "urdu.pdf", 2, "Doc"))
    output = run_tool(
        PageNumbersTool(),
        tmp_path,
        [source],
        format="custom",
        template="صفحہ {n} از {total}",
        digits="extended_arabic_indic",
        font="noto-nastaliq-urdu",
        size=16,
    )[0]
    assert any("NotoNastaliqUrdu" in name for name in embedded_fonts(output.path))
    texts = pdfium_texts(output.path)
    assert "صفحہ" in texts[1]
    assert "۲" in texts[1] and "از" in texts[1]


def test_skip_first_and_last(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "five.pdf", 5, "Doc"))
    output = run_tool(PageNumbersTool(), tmp_path, [source], skip_first=1, skip_last=1, format="page_n")[0]
    texts = page_texts(output.path)
    assert "Page" not in texts[0].replace("Doc page", "")
    assert _last_line(texts[1]) == "Page 1"
    assert _last_line(texts[3]) == "Page 3"
    assert "Page" not in texts[4].replace("Doc page", "")


def test_nothing_selected_is_rejected(tmp_path: Path, fixtures_dir: Path) -> None:
    source = as_input(make_pdf(fixtures_dir / "two.pdf", 2, "Doc"))
    with pytest.raises(ToolInputError):
        run_tool(PageNumbersTool(), tmp_path, [source], skip_first=2)


def test_batch_numbers_each_file(tmp_path: Path, fixtures_dir: Path) -> None:
    first = as_input(make_pdf(fixtures_dir / "a.pdf", 2, "A"))
    second = as_input(make_pdf(fixtures_dir / "b.pdf", 3, "B"))
    outputs = run_tool(PageNumbersTool(), tmp_path, [first, second], format="page_n_of_total")
    assert [output.filename for output in outputs] == ["a-numbered.pdf", "b-numbered.pdf"]
    assert _last_line(page_texts(outputs[1].path)[2]) == "Page 3 of 3"
    assert not any(zipfile.is_zipfile(output.path) for output in outputs)


def test_encrypted_input_is_numbered(tmp_path: Path, fixtures_dir: Path) -> None:
    from tests.pdf_factory import make_encrypted_pdf

    path = make_encrypted_pdf(fixtures_dir / "locked.pdf", "pw-123")
    with pikepdf.open(path, password="pw-123") as pdf:
        count = len(pdf.pages)
    from app.files.sniff import FileKind
    from app.tools.base import InputFile

    item = InputFile(
        path=path,
        original_name="locked.pdf",
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=path.stat().st_size,
        page_count=count,
        encrypted=True,
        password="pw-123",
    )
    output = run_tool(PageNumbersTool(), tmp_path, [item])[0]
    assert _last_line(page_texts(output.path)[1]) == "2"
