import zipfile
from pathlib import Path
from typing import Any

import pikepdf
import pytest
from pydantic import ValidationError

from app.files.sniff import FileKind
from app.tools.base import InputFile, InputFileInfo, JobContext, Tool
from app.tools.optimize.flatten import FlattenOptions, FlattenTool, flatten_document
from app.tools.registry import get_registry
from tests.pdf_factory import make_encrypted_pdf, make_form_pdf, make_pdf, page_texts
from tests.qpdf_check import assert_qpdf_ok

A4_HEIGHT = 842


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
    )


def _run(tool: Tool[Any], tmp_path: Path, inputs: list[InputFile], **options: object) -> list[Any]:
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


def _appearance(pdf: pikepdf.Pdf, width: float, height: float, content: bytes) -> pikepdf.Stream:
    stream = pikepdf.Stream(pdf, content)
    stream.Type = pikepdf.Name.XObject
    stream.Subtype = pikepdf.Name.Form
    stream.BBox = pikepdf.Array([0, 0, width, height])
    stream.Resources = pikepdf.Dictionary(
        Font=pikepdf.Dictionary(
            Helv=pikepdf.Dictionary(
                Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica
            )
        )
    )
    return stream


def make_annotated_pdf(path: Path) -> Path:
    source = make_pdf(path.with_name("plain-" + path.name), 1, "Review")
    with pikepdf.open(source) as pdf:
        note = pikepdf.Dictionary(
            Type=pikepdf.Name.Annot,
            Subtype=pikepdf.Name.FreeText,
            Rect=pikepdf.Array([72, 500, 372, 530]),
            Contents=pikepdf.String("Reviewer note"),
            DA=pikepdf.String("/Helv 14 Tf 0 g"),
            AP=pikepdf.Dictionary(
                N=_appearance(pdf, 300, 30, b"BT /Helv 14 Tf 0 g 4 10 Td (Reviewer note) Tj ET")
            ),
        )
        square = pikepdf.Dictionary(
            Type=pikepdf.Name.Annot,
            Subtype=pikepdf.Name.Square,
            Rect=pikepdf.Array([72, 300, 272, 400]),
            C=pikepdf.Array([1, 0, 0]),
            AP=pikepdf.Dictionary(N=_appearance(pdf, 200, 100, b"1 0 0 rg 0 0 200 100 re f")),
        )
        stamp = pikepdf.Dictionary(
            Type=pikepdf.Name.Annot,
            Subtype=pikepdf.Name.Stamp,
            Name=pikepdf.Name.Approved,
            Rect=pikepdf.Array([320, 300, 520, 360]),
            AP=pikepdf.Dictionary(
                N=_appearance(
                    pdf, 200, 60, b"0 0 1 rg 0 0 200 60 re f BT /Helv 20 Tf 1 g 20 20 Td (APPROVED) Tj ET"
                )
            ),
        )
        link = pikepdf.Dictionary(
            Type=pikepdf.Name.Annot,
            Subtype=pikepdf.Name.Link,
            Rect=pikepdf.Array([72, 100, 272, 120]),
            Border=pikepdf.Array([0, 0, 0]),
            A=pikepdf.Dictionary(S=pikepdf.Name.URI, URI=pikepdf.String("https://example.com/")),
        )
        pdf.pages[0].Annots = pdf.make_indirect(
            pikepdf.Array([pdf.make_indirect(item) for item in (note, square, stamp, link)])
        )
        pdf.save(path)
    return path


def _subtypes(path: Path) -> list[str]:
    with pikepdf.open(path) as pdf:
        return [str(annotation.Subtype) for page in pdf.pages for annotation in page.obj.get("/Annots", [])]


def _ink_ratio(path: Path, left: float, top: float, right: float, bottom: float) -> float:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(path))
    try:
        image = document[0].render(scale=1).to_pil().convert("L")
    finally:
        document.close()
    crop = image.crop((int(left), int(A4_HEIGHT - top), int(right), int(A4_HEIGHT - bottom)))
    dark = sum(1 for value in crop.getdata() if value < 160)
    return dark / max(crop.width * crop.height, 1)


def _pixel(path: Path, x: float, y: float) -> tuple[int, int, int]:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(path))
    try:
        image = document[0].render(scale=1).to_pil().convert("RGB")
    finally:
        document.close()
    red, green, blue = image.getpixel((int(x), int(A4_HEIGHT - y)))
    return red, green, blue


def test_registered() -> None:
    assert "flatten" in get_registry()


def test_form_fields_become_page_content(tmp_path: Path) -> None:
    source = make_form_pdf(tmp_path / "form.pdf")
    output = _run(FlattenTool(), tmp_path, [_input(source)])[0]
    assert output.filename == "form-flattened.pdf"
    with pikepdf.open(output.path) as pdf:
        assert "/AcroForm" not in pdf.Root
        assert all(
            str(annotation.Subtype) != "/Widget"
            for page in pdf.pages
            for annotation in page.obj.get("/Annots", [])
        )
    assert "Ayesha Khan" in page_texts(output.path)[0]
    assert _ink_ratio(output.path, 72, 724, 372, 700) > 0.01
    assert _ink_ratio(output.path, 72, 668, 90, 650) > 0.01


def test_annotations_and_stamps_flattened_links_kept(tmp_path: Path) -> None:
    source = make_annotated_pdf(tmp_path / "notes.pdf")
    output = _run(FlattenTool(), tmp_path, [_input(source)])[0]
    assert _subtypes(output.path) == ["/Link"]
    assert "Reviewer note" in page_texts(output.path)[0]
    red, green, blue = _pixel(output.path, 172, 350)
    assert red > 200 and green < 60 and blue < 60
    red, green, blue = _pixel(output.path, 330, 310)
    assert blue > 200 and red < 60


def test_links_removed_when_not_kept(tmp_path: Path) -> None:
    source = make_annotated_pdf(tmp_path / "notes.pdf")
    output = _run(FlattenTool(), tmp_path, [_input(source)], keep_links=False)[0]
    assert _subtypes(output.path) == []


def test_only_stamps(tmp_path: Path) -> None:
    source = make_annotated_pdf(tmp_path / "notes.pdf")
    output = _run(FlattenTool(), tmp_path, [_input(source)], forms=False, annotations=False)[0]
    assert sorted(_subtypes(output.path)) == ["/FreeText", "/Link", "/Square"]


def test_forms_kept_when_only_annotations_flattened(tmp_path: Path) -> None:
    source = make_form_pdf(tmp_path / "form.pdf")
    output = _run(FlattenTool(), tmp_path, [_input(source)], forms=False)[0]
    with pikepdf.open(output.path) as pdf:
        assert len(pdf.Root.AcroForm.Fields) == 2
    assert _subtypes(output.path) == ["/Widget", "/Widget"]


def test_batch(tmp_path: Path) -> None:
    form = make_form_pdf(tmp_path / "a.pdf")
    notes = make_annotated_pdf(tmp_path / "b.pdf")
    outputs = _run(FlattenTool(), tmp_path, [_input(form), _input(notes)])
    assert [output.filename for output in outputs] == ["a-flattened.pdf", "b-flattened.pdf"]
    assert _subtypes(outputs[0].path) == []
    assert _subtypes(outputs[1].path) == ["/Link"]


def test_encrypted_input(tmp_path: Path) -> None:
    source = make_encrypted_pdf(tmp_path / "locked.pdf")
    output = _run(FlattenTool(), tmp_path, [_input(source, password="secret-pass")])[0]
    with pikepdf.open(output.path) as pdf:
        assert not pdf.is_encrypted


def test_hostile_annotation_entries(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "odd.pdf", 2, "Odd")
    with pikepdf.open(source, allow_overwriting_input=True) as pdf:
        pdf.pages[0].Annots = pikepdf.Array([7, pikepdf.Name.Junk])
        pdf.pages[1].obj.Annots = pikepdf.Name.Broken
        result = flatten_document(pdf, FlattenOptions())
        assert result.removed == 2
        pdf.save(source)
    assert_qpdf_ok(source)
    assert _subtypes(source) == []


def test_nothing_selected_is_rejected() -> None:
    with pytest.raises(ValidationError):
        FlattenOptions(forms=False, annotations=False, stamps=False)


def test_zip_not_needed_for_single_output(tmp_path: Path) -> None:
    source = make_form_pdf(tmp_path / "form.pdf")
    outputs = _run(FlattenTool(), tmp_path, [_input(source)])
    assert len(outputs) == 1
    assert not zipfile.is_zipfile(outputs[0].path)
