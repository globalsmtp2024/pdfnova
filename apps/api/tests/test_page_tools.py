import dataclasses
import itertools
import zipfile
from pathlib import Path
from typing import Any

import pikepdf
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.jobs.engine import _unique_names, build_zip
from app.tools.base import InputFile, InputFileInfo, JobContext, Tool, ToolFailedError
from app.tools.organize.merge import MergeTool
from app.tools.organize.page_tools import (
    ExtractPagesTool,
    OrganizeTool,
    RemovePagesTool,
    RotateTool,
    SplitTool,
)
from app.tools.pdfkit import new_pdf_from_pages
from app.tools.registry import get_registry
from tests.pdf_factory import corrupt_variants, make_encrypted_pdf, make_image_pdf, make_pdf, page_texts
from tests.qpdf_check import assert_qpdf_ok


def _input(path: Path, name: str | None = None, password: str | None = None) -> InputFile:
    with pikepdf.open(path, password=password or "") as pdf:
        count = len(pdf.pages)
    return InputFile(
        path=path,
        original_name=name or path.name,
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=path.stat().st_size,
        page_count=count,
        password=password,
    )


def _info(item: InputFile) -> InputFileInfo:
    return InputFileInfo(item.original_name, item.size_bytes, item.kind, item.page_count)


def _run(tool: Tool[Any], tmp_path: Path, inputs: list[InputFile], **options: object) -> list[Any]:
    parsed = tool.parse_options(dict(options))
    tool.validate_inputs([_info(item) for item in inputs], parsed)
    ctx = JobContext(workdir=tmp_path / "work", inputs=inputs, options=parsed)
    ctx.scratch_dir.mkdir(parents=True, exist_ok=True)
    return _checked(tool.run(ctx))


def _checked(outputs: list[Any]) -> list[Any]:
    for output in outputs:
        if output.mime_type == "application/pdf":
            assert_qpdf_ok(output.path)
    return outputs


def _first_lines(path: Path) -> list[str]:
    return [text.split("\n")[0].strip() for text in page_texts(path)]


@pytest.fixture
def ten(fixtures_dir: Path) -> InputFile:
    return _input(make_pdf(fixtures_dir / "ten.pdf", 10, "Doc", outline=True))


def test_registry_lists_page_tools() -> None:
    registry = get_registry()
    for slug in ("rotate", "remove-pages", "extract-pages", "split", "organize"):
        assert slug in registry


def test_rotate_selected_pages(tmp_path: Path, ten: InputFile) -> None:
    output = _run(RotateTool(), tmp_path, [ten], angle=180, pages="odd")[0]
    with pikepdf.open(output.path) as pdf:
        assert [int(p.obj.get("/Rotate", 0)) for p in pdf.pages][:4] == [180, 0, 180, 0]


def test_rotate_per_page_and_batch(tmp_path: Path, fixtures_dir: Path, ten: InputFile) -> None:
    other = _input(make_pdf(fixtures_dir / "three.pdf", 3, "Other"))
    outputs = _run(RotateTool(), tmp_path, [ten, other], per_page={2: 90, 3: 270})
    assert len(outputs) == 2
    with pikepdf.open(outputs[1].path) as pdf:
        assert [int(p.obj.get("/Rotate", 0)) for p in pdf.pages] == [0, 90, 270]


def test_batch_continues_after_a_bad_file(tmp_path: Path, fixtures_dir: Path, ten: InputFile) -> None:
    broken = corrupt_variants(fixtures_dir)["truncated"]
    bad = InputFile(broken, "broken.pdf", FileKind.PDF, "application/pdf", broken.stat().st_size, None)
    parsed = RotateTool().parse_options({})
    ctx = JobContext(workdir=tmp_path / "work", inputs=[ten, bad], options=parsed)
    outputs = _checked(RotateTool().run(ctx))
    assert [o.filename for o in outputs][-1] == "processing-report.txt"
    assert "broken.pdf" in outputs[-1].path.read_text(encoding="utf-8")


def test_rotate_rejects_out_of_range(ten: InputFile) -> None:
    tool = RotateTool()
    with pytest.raises(ToolInputError, match="outside"):
        tool.validate_inputs([_info(ten)], tool.parse_options({"per_page": {11: 90}}))
    with pytest.raises(ToolInputError, match="Invalid options"):
        tool.parse_options({"angle": 45})


def test_remove_pages_keeps_bookmarks_for_remaining(tmp_path: Path, ten: InputFile) -> None:
    output = _run(RemovePagesTool(), tmp_path, [ten], pages="2-4, 10")[0]
    assert _first_lines(output.path) == [f"Doc page {n}" for n in (1, 5, 6, 7, 8, 9)]
    with pikepdf.open(output.path) as pdf, pdf.open_outline() as outline:
        assert [item.title for item in outline.root] == [f"Doc section {n}" for n in (1, 5, 6, 7, 8, 9)]


def test_remove_every_page_is_refused(ten: InputFile) -> None:
    tool = RemovePagesTool()
    with pytest.raises(ToolInputError, match="every page"):
        tool.validate_inputs([_info(ten)], tool.parse_options({"pages": "all"}))


def test_extract_single_and_separate(tmp_path: Path, ten: InputFile) -> None:
    single = _run(ExtractPagesTool(), tmp_path / "a", [ten], pages="8,2")[0]
    assert _first_lines(single.path) == ["Doc page 8", "Doc page 2"]
    separate = _run(ExtractPagesTool(), tmp_path / "b", [ten], pages="1-3", mode="separate")
    assert [o.filename for o in separate] == ["ten_page-001.pdf", "ten_page-002.pdf", "ten_page-003.pdf"]


def test_split_modes(tmp_path: Path, ten: InputFile) -> None:
    ranges = _run(SplitTool(), tmp_path / "r", [ten], ranges=["1-3", "7-end"])
    assert [len(page_texts(o.path)) for o in ranges] == [3, 4]
    assert ranges[0].filename == "ten_part-01_pages-1-3.pdf"
    merged = _run(SplitTool(), tmp_path / "m", [ten], ranges=["1-2", "9"], merge_ranges=True)
    assert len(merged) == 1 and len(page_texts(merged[0].path)) == 3
    every = _run(SplitTool(), tmp_path / "e", [ten], mode="every", every=4)
    assert [len(page_texts(o.path)) for o in every] == [4, 4, 2]
    each = _run(SplitTool(), tmp_path / "x", [ten], mode="each")
    assert len(each) == 10
    marks = _run(SplitTool(), tmp_path / "b", [ten], mode="bookmarks")
    assert len(marks) == 10


def test_split_by_size_respects_limit(tmp_path: Path, fixtures_dir: Path) -> None:
    images = _input(make_image_pdf(fixtures_dir / "images.pdf", pages=6, size=600))
    whole = images.path.stat().st_size
    limit_mb = whole * 0.4 / (1024 * 1024)
    parts = _run(SplitTool(), tmp_path, [images], mode="size", max_size_mb=limit_mb)
    assert len(parts) >= 2
    assert sum(len(page_texts(p.path)) for p in parts) == 6
    assert all(p.path.stat().st_size <= limit_mb * 1024 * 1024 for p in parts)


def test_split_by_blank_pages(tmp_path: Path, fixtures_dir: Path) -> None:
    source = make_pdf(fixtures_dir / "blanks.pdf", 4, "Doc")
    with pikepdf.open(source, allow_overwriting_input=True) as pdf:
        pdf.pages.insert(2, pikepdf.Page(pdf.add_blank_page(page_size=(595, 842))))
        del pdf.pages[-1]
        pdf.save(source)
    parts = _run(SplitTool(), tmp_path, [_input(source)], mode="blank")
    assert [_first_lines(p.path) for p in parts] == [
        ["Doc page 1", "Doc page 2"],
        ["Doc page 3", "Doc page 4"],
    ]


def test_split_template_and_validation(tmp_path: Path, ten: InputFile) -> None:
    tool = SplitTool()
    with pytest.raises(ToolInputError, match="Invalid options"):
        tool.parse_options({"ranges": ["1"], "filename_template": "{evil.__class__}"})
    with pytest.raises(ToolInputError, match="Invalid options"):
        tool.parse_options({"mode": "ranges"})
    outputs = _run(tool, tmp_path, [ten], ranges=["1"], filename_template="../../{name}-{part}")
    name = outputs[0].filename
    assert "/" not in name and "\\" not in name and not name.startswith(".")


def test_split_without_bookmarks_fails_cleanly(tmp_path: Path, fixtures_dir: Path) -> None:
    plain = _input(make_pdf(fixtures_dir / "plain.pdf", 3))
    with pytest.raises(ToolInputError, match="no top-level bookmarks"):
        _run(SplitTool(), tmp_path, [plain], mode="bookmarks")


def test_organize_reorders_duplicates_and_mixes_files(tmp_path: Path, fixtures_dir: Path) -> None:
    first = _input(make_pdf(fixtures_dir / "one.pdf", 3, "One"))
    second = _input(make_pdf(fixtures_dir / "two.pdf", 2, "Two"))
    operations = [
        {"page": 3},
        {"file": 1, "page": 2, "rotate": 90},
        {"source": "blank"},
        {"page": 1},
        {"page": 1},
    ]
    output = _run(OrganizeTool(), tmp_path, [first, second], pages=operations)[0]
    assert _first_lines(output.path) == ["One page 3", "Two page 2", "", "One page 1", "One page 1"]
    with pikepdf.open(output.path) as pdf:
        assert int(pdf.pages[1].obj.get("/Rotate", 0)) == 90


def test_organize_validation(fixtures_dir: Path) -> None:
    first = _input(make_pdf(fixtures_dir / "one.pdf", 3, "One"))
    tool = OrganizeTool()
    with pytest.raises(ToolInputError, match="doesn't exist"):
        tool.validate_inputs([_info(first)], tool.parse_options({"pages": [{"page": 4}]}))
    with pytest.raises(ToolInputError, match="not uploaded"):
        tool.validate_inputs([_info(first)], tool.parse_options({"pages": [{"file": 1, "page": 1}]}))


def test_encrypted_input_with_password(tmp_path: Path, fixtures_dir: Path) -> None:
    locked = make_encrypted_pdf(fixtures_dir / "locked.pdf", "pw-123")
    item = _input(locked, password="pw-123")
    output = _run(ExtractPagesTool(), tmp_path, [item], pages="2")[0]
    assert _first_lines(output.path) == ["Locked page 2"]
    wrong = InputFile(locked, "locked.pdf", FileKind.PDF, "application/pdf", 1, 2, password="nope")
    ctx = JobContext(
        workdir=tmp_path / "w2", inputs=[wrong], options=ExtractPagesTool().parse_options({"pages": "1"})
    )
    with pytest.raises(ToolFailedError):
        ExtractPagesTool().run(ctx)


def test_zip_names_are_safe(tmp_path: Path, ten: InputFile) -> None:
    outputs = _run(ExtractPagesTool(), tmp_path, [ten], pages="1-2", mode="separate")
    outputs[1] = dataclasses.replace(outputs[1], filename="../../etc/passwd")
    names = _unique_names(outputs)
    archive = build_zip(outputs, names, tmp_path / "bundle.zip")
    with zipfile.ZipFile(archive) as bundle:
        assert all("/" not in n and "\\" not in n and not n.startswith("..") for n in bundle.namelist())


def test_document_info_copy_survives_indirect_values(tmp_path: Path) -> None:
    source_path = tmp_path / "info.pdf"
    with pikepdf.new() as pdf:
        pdf.add_blank_page()
        pdf.add_blank_page()
        pdf.trailer.Info = pdf.make_indirect(
            pikepdf.Dictionary(
                Title=pdf.make_indirect(pikepdf.String("Quarterly report")),
                Author=pikepdf.String("Finance"),
                Trapped=pikepdf.Name.False_,
            )
        )
        pdf.save(source_path)
    with pikepdf.open(source_path) as source:
        result, _ = new_pdf_from_pages(source, [1])
        with result:
            target = tmp_path / "copy.pdf"
            result.save(target)
    assert_qpdf_ok(target)
    with pikepdf.open(target) as copied:
        assert str(copied.docinfo["/Title"]) == "Quarterly report"
        assert str(copied.docinfo["/Author"]) == "Finance"


@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    page_count=st.integers(min_value=1, max_value=12),
    cuts=st.sets(st.integers(min_value=1, max_value=11), max_size=6),
)
def test_split_then_merge_round_trip(tmp_path: Path, page_count: int, cuts: set[int]) -> None:
    run_dir = tmp_path / f"run-{page_count}-{'-'.join(map(str, sorted(cuts)))}"
    source = _input(make_pdf(run_dir / "source.pdf", page_count, "Doc"))
    boundaries = sorted({0, *(cut for cut in cuts if cut < page_count), page_count})
    ranges = [f"{start + 1}-{end}" for start, end in itertools.pairwise(boundaries)]
    parts = _run(SplitTool(), run_dir / "split", [source], ranges=ranges)
    assert len(parts) == len(ranges)
    pieces = [_input(part.path) for part in parts]
    if len(pieces) == 1:
        merged_path = pieces[0].path
    else:
        merged_path = _run(MergeTool(), run_dir / "merge", pieces, add_bookmarks=False)[0].path
    assert _first_lines(merged_path) == [f"Doc page {n}" for n in range(1, page_count + 1)]
