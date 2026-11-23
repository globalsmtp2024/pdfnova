from pathlib import Path
from typing import Any

import pikepdf
import pytest
from pydantic import ValidationError

from app.files.hidden_data import scan_hidden_data
from app.files.inspect import inspect_document
from app.files.sniff import FileKind
from app.tools.base import InputFile, InputFileInfo, JobContext, Tool
from app.tools.edit.metadata import EditMetadataTool, MetadataOptions
from app.tools.registry import get_registry
from tests.pdf_factory import make_attachment_pdf, make_encrypted_pdf, make_pdf
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


def make_hidden_data_pdf(path: Path) -> Path:
    source = make_attachment_pdf(path.with_name("attach-" + path.name))
    with pikepdf.open(source) as pdf:
        script = pdf.make_indirect(
            pikepdf.Dictionary(S=pikepdf.Name.JavaScript, JS=pikepdf.String("app.alert(2)"))
        )
        pdf.Root.Names.JavaScript = pikepdf.Dictionary(Names=pikepdf.Array([pikepdf.String("init"), script]))
        pdf.Root.AA = pikepdf.Dictionary(
            WC=pikepdf.Dictionary(S=pikepdf.Name.JavaScript, JS=pikepdf.String("app.alert(3)"))
        )
        page = pdf.pages[0]
        page.obj.AA = pikepdf.Dictionary(
            O=pikepdf.Dictionary(S=pikepdf.Name.JavaScript, JS=pikepdf.String("app.alert(4)"))
        )
        page.obj.Thumb = pdf.make_indirect(pikepdf.Stream(pdf, b"\x00" * 12))
        page.obj.Metadata = pdf.make_indirect(pikepdf.Stream(pdf, b"<x:xmpmeta xmlns:x='adobe:ns:meta/'/>"))
        with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as meta:
            meta["dc:title"] = "Quarterly report"
        pdf.save(path)
    return path


def test_registered() -> None:
    assert "edit-metadata" in get_registry()


def test_set_fields_updates_info_and_xmp(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "plain.pdf", 2, "Plain")
    output = _run(
        EditMetadataTool(),
        tmp_path,
        [_input(source)],
        title="Annual review",
        author="Ayesha Khan",
        subject="Finance",
        keywords="budget, 2025",
        creator="Writer",
        producer="Press",
        creation_date="D:20240131093000",
        modification_date="D:20240201101500Z",
        custom={"Department": "Audit", "Case-No.1": "42"},
    )[0]
    assert output.filename == "plain-metadata.pdf"
    with pikepdf.open(output.path) as pdf:
        info = pdf.docinfo
        assert str(info["/Title"]) == "Annual review"
        assert str(info["/Author"]) == "Ayesha Khan"
        assert str(info["/Subject"]) == "Finance"
        assert str(info["/Keywords"]) == "budget, 2025"
        assert str(info["/Creator"]) == "Writer"
        assert str(info["/Producer"]) == "Press"
        assert str(info["/CreationDate"]) == "D:20240131093000"
        assert str(info["/Department"]) == "Audit"
        assert str(info["/Case-No.1"]) == "42"
        meta = pdf.open_metadata()
        assert meta["dc:title"] == "Annual review"
        assert meta["dc:creator"] == ["Ayesha Khan"]
        assert meta["dc:description"] == "Finance"
        assert meta["pdf:Keywords"] == "budget, 2025"
        assert meta["xmp:CreatorTool"] == "Writer"
        assert meta["pdf:Producer"] == "Press"
        assert meta["xmp:CreateDate"].startswith("2024-01-31T09:30:00")


def test_empty_value_clears_field_and_xmp(tmp_path: Path) -> None:
    source = make_hidden_data_pdf(tmp_path / "hidden.pdf")
    output = _run(EditMetadataTool(), tmp_path, [_input(source)], title="", author="New author")[0]
    with pikepdf.open(output.path) as pdf:
        assert "/Title" not in pdf.docinfo
        assert str(pdf.docinfo["/Author"]) == "New author"
        meta = pdf.open_metadata()
        assert "dc:title" not in meta
        assert meta["dc:creator"] == ["New author"]


def test_remove_all_metadata(tmp_path: Path) -> None:
    source = make_hidden_data_pdf(tmp_path / "hidden.pdf")
    output = _run(EditMetadataTool(), tmp_path, [_input(source)], remove_all=True)[0]
    with pikepdf.open(output.path) as pdf:
        info = pdf.trailer.get("/Info")
        assert info is None or len(info.keys()) == 0
        assert "/Metadata" not in pdf.Root
        assert all("/Metadata" not in page.obj for page in pdf.pages)
        assert len(pdf.attachments) == 1


def test_strip_hidden_data(tmp_path: Path) -> None:
    source = make_hidden_data_pdf(tmp_path / "hidden.pdf")
    with pikepdf.open(source) as pdf:
        before = scan_hidden_data(pdf)
    assert before.as_dict() == {"attachments": 1, "javascript": 4, "thumbnails": 1}
    output = _run(
        EditMetadataTool(),
        tmp_path,
        [_input(source)],
        remove_all=True,
        remove_attachments=True,
        remove_javascript=True,
        remove_thumbnails=True,
    )[0]
    with pikepdf.open(output.path) as pdf:
        assert scan_hidden_data(pdf).as_dict() == {"attachments": 0, "javascript": 0, "thumbnails": 0}
        assert len(pdf.attachments) == 0
        assert "/OpenAction" not in pdf.Root
        assert "/AA" not in pdf.Root
        assert "/JavaScript" not in pdf.Root.Names
        assert "/AA" not in pdf.pages[0].obj
        assert "/Thumb" not in pdf.pages[0].obj
        raw = output.path.read_bytes()
    assert b"hidden notes" not in raw


def test_hidden_data_choices_are_independent(tmp_path: Path) -> None:
    source = make_hidden_data_pdf(tmp_path / "hidden.pdf")
    output = _run(EditMetadataTool(), tmp_path, [_input(source)], remove_javascript=True)[0]
    with pikepdf.open(output.path) as pdf:
        assert scan_hidden_data(pdf).as_dict() == {"attachments": 1, "javascript": 0, "thumbnails": 1}
        assert str(pdf.docinfo["/Author"]) == "Secret Author"


@pytest.mark.parametrize(
    "value",
    ["2024-01-31", "D:2024013109300", "D:20241301093000", "D:20240230093000", "D:20240131250000", "now"],
)
def test_invalid_dates_rejected(value: str) -> None:
    with pytest.raises(ValidationError):
        MetadataOptions(creation_date=value)


@pytest.mark.parametrize("value", ["D:20240131093000", "D:20240131093000Z", "D:20240131093000+05'00'"])
def test_valid_dates_accepted(value: str) -> None:
    assert MetadataOptions(modification_date=value).modification_date == value


@pytest.mark.parametrize("key", ["", "1abc", "has space", "Title", "a" * 65, "slash/key"])
def test_invalid_custom_keys_rejected(key: str) -> None:
    with pytest.raises(ValidationError):
        MetadataOptions(custom={key: "value"})


def test_length_limits() -> None:
    with pytest.raises(ValidationError):
        MetadataOptions(title="x" * 2001)
    with pytest.raises(ValidationError):
        MetadataOptions(custom={"Note": "x" * 2001})
    with pytest.raises(ValidationError):
        MetadataOptions(custom={f"Key{index}": "v" for index in range(51)})


def test_encrypted_input(tmp_path: Path) -> None:
    source = make_encrypted_pdf(tmp_path / "locked.pdf")
    output = _run(EditMetadataTool(), tmp_path, [_input(source, password="secret-pass")], title="Opened")[0]
    with pikepdf.open(output.path) as pdf:
        assert str(pdf.docinfo["/Title"]) == "Opened"


def test_batch(tmp_path: Path) -> None:
    first = make_pdf(tmp_path / "a.pdf", 1, "A")
    second = make_hidden_data_pdf(tmp_path / "b.pdf")
    outputs = _run(EditMetadataTool(), tmp_path, [_input(first), _input(second)], author="Team")
    assert [output.filename for output in outputs] == ["a-metadata.pdf", "b-metadata.pdf"]
    for output in outputs:
        with pikepdf.open(output.path) as pdf:
            assert str(pdf.docinfo["/Author"]) == "Team"


def test_inspection_reports_metadata(tmp_path: Path) -> None:
    source = make_hidden_data_pdf(tmp_path / "hidden.pdf")
    with pikepdf.open(source, allow_overwriting_input=True) as pdf:
        pdf.docinfo["/Department"] = "Audit"
        pdf.save(source)
    metadata = inspect_document(source)["metadata"]
    assert metadata["title"] == "Quarterly report"
    assert metadata["author"] == "Secret Author"
    assert metadata["custom"] == {"Department": "Audit"}
    assert metadata["has_xmp"] is True
    assert metadata["pages_with_xmp"] == 1
    assert metadata["hidden"] == {"attachments": 1, "javascript": 4, "thumbnails": 1}


def test_inspection_without_info(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "bare.pdf", 1, "Bare")
    with pikepdf.open(source, allow_overwriting_input=True) as pdf:
        del pdf.trailer["/Info"]
        pdf.save(source)
    metadata = inspect_document(source)["metadata"]
    assert metadata["title"] is None
    assert metadata["has_info"] is False
    assert metadata["hidden"] == {"attachments": 0, "javascript": 0, "thumbnails": 0}
