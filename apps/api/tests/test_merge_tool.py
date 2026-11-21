from pathlib import Path

import pikepdf
import pytest

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.jobs.sandbox import SandboxError, SandboxLimits, SandboxRequest, SandboxSuccess, run_in_sandbox
from app.tools.base import InputFile, InputFileInfo, JobCancelledError, JobContext
from app.tools.organize.merge import MergeOptions, MergeTool
from app.tools.registry import get_registry
from tests.pdf_factory import make_pdf, page_texts
from tests.qpdf_check import assert_qpdf_ok


def _input(path: Path, name: str, pages: int) -> InputFile:
    return InputFile(
        path=path,
        original_name=name,
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=path.stat().st_size,
        page_count=pages,
    )


@pytest.fixture
def inputs(fixtures_dir: Path) -> list[InputFile]:
    first = make_pdf(fixtures_dir / "alpha.pdf", 3, "Alpha", outline=True)
    second = make_pdf(fixtures_dir / "beta.pdf", 4, "Beta")
    return [_input(first, "alpha.pdf", 3), _input(second, "beta.pdf", 4)]


def _context(tmp_path: Path, inputs: list[InputFile], **options: object) -> JobContext[MergeOptions]:
    tool = MergeTool()
    return JobContext(workdir=tmp_path / "work", inputs=inputs, options=tool.parse_options(dict(options)))


def _outline_titles(path: Path) -> list[tuple[str, list[str]]]:
    with pikepdf.open(path) as pdf, pdf.open_outline() as outline:
        return [(item.title, [child.title for child in item.children]) for item in outline.root]


def test_registry_discovers_merge() -> None:
    registry = get_registry()
    assert "merge" in registry
    described = registry.get("merge").describe()
    assert described["category"] == "organize"
    assert described["input_spec"]["min_files"] == 2
    assert "files" in described["options_schema"]["properties"]


def test_merge_combines_in_order_with_bookmarks(tmp_path: Path, inputs: list[InputFile]) -> None:
    progress: list[float] = []
    ctx = _context(tmp_path, inputs)
    ctx.reporter = lambda fraction, _label: progress.append(fraction)
    outputs = MergeTool().run(ctx)
    assert_qpdf_ok(outputs[0].path)
    assert len(outputs) == 1 and outputs[0].filename == "merged.pdf"
    texts = page_texts(outputs[0].path)
    assert len(texts) == 7
    assert "Alpha page 1" in texts[0] and "Beta page 1" in texts[3] and "Beta page 4" in texts[6]
    assert _outline_titles(outputs[0].path) == [
        ("alpha", ["Alpha section 1", "Alpha section 2", "Alpha section 3"]),
        ("beta", []),
    ]
    assert progress[-1] == 1.0 and progress == sorted(progress)


def test_merge_page_ranges_rotation_and_titles(tmp_path: Path, inputs: list[InputFile]) -> None:
    ctx = _context(
        tmp_path,
        inputs,
        files=[{"pages": "3,1", "rotate": 90, "bookmark_title": "First"}, {"pages": "2-last"}],
        output_name="combined",
    )
    output = MergeTool().run(ctx)[0]
    assert_qpdf_ok(output.path)
    assert output.filename == "combined.pdf"
    texts = page_texts(output.path)
    assert [t.split("\n")[0].strip() for t in texts] == [
        "Alpha page 3",
        "Alpha page 1",
        "Beta page 2",
        "Beta page 3",
        "Beta page 4",
    ]
    with pikepdf.open(output.path) as pdf:
        assert [int(page.obj.get("/Rotate", 0)) for page in pdf.pages] == [90, 90, 0, 0, 0]
    titles = _outline_titles(output.path)
    assert titles[0][0] == "First" and titles[0][1] == ["Alpha section 1", "Alpha section 3"]


def test_merge_without_bookmarks_keeps_existing_flat(tmp_path: Path, inputs: list[InputFile]) -> None:
    ctx = _context(tmp_path, inputs, add_bookmarks=False)
    output = MergeTool().run(ctx)[0]
    assert_qpdf_ok(output.path)
    assert [t for t, _ in _outline_titles(output.path)] == [
        "Alpha section 1",
        "Alpha section 2",
        "Alpha section 3",
    ]


def test_merge_validation(inputs: list[InputFile]) -> None:
    tool = MergeTool()
    infos = [
        InputFileInfo(name=i.original_name, size_bytes=i.size_bytes, kind=i.kind, page_count=i.page_count)
        for i in inputs
    ]
    tool.validate_inputs(infos, tool.parse_options({}))
    with pytest.raises(ToolInputError, match="at least 2"):
        tool.validate_inputs(infos[:1], tool.parse_options({}))
    with pytest.raises(ToolInputError, match="outside this document"):
        tool.validate_inputs(infos, tool.parse_options({"files": [{"pages": "9"}, {}]}))
    with pytest.raises(ToolInputError, match="do not match"):
        tool.validate_inputs(infos, tool.parse_options({"files": [{}]}))
    with pytest.raises(ToolInputError, match="cannot open"):
        tool.validate_inputs(
            [*infos[:1], InputFileInfo("x.png", 10, FileKind.IMAGE, None)], tool.parse_options({})
        )
    with pytest.raises(ToolInputError, match="password-protected"):
        tool.validate_inputs(
            [*infos[:1], InputFileInfo("x.pdf", 10, FileKind.PDF, None, encrypted=True)],
            tool.parse_options({}),
        )
    with pytest.raises(ToolInputError, match="Invalid options"):
        tool.parse_options({"files": [{"rotate": 45}]})
    with pytest.raises(ToolInputError, match="Invalid options"):
        tool.parse_options({"unknown": True})


def test_merge_honours_cancellation(tmp_path: Path, inputs: list[InputFile]) -> None:
    ctx = _context(tmp_path, inputs)
    ctx.is_cancelled = lambda: True
    with pytest.raises(JobCancelledError):
        MergeTool().run(ctx)


def _sandbox_request(
    tmp_path: Path, inputs: list[InputFile], options: dict[str, object], timeout: int = 120
) -> SandboxRequest:
    workdir = tmp_path / "sandbox"
    (workdir / "scratch").mkdir(parents=True, exist_ok=True)
    return SandboxRequest(
        tool_slug="merge",
        workdir=workdir,
        inputs=inputs,
        options=options,
        limits=SandboxLimits(timeout_seconds=timeout, memory_mb=1024, max_output_bytes=512 * 1024 * 1024),
    )


def test_sandbox_runs_tool_in_child_process(tmp_path: Path, inputs: list[InputFile]) -> None:
    events: list[tuple[float, str]] = []
    result = run_in_sandbox(
        _sandbox_request(tmp_path, inputs, {}), lambda f, label: events.append((f, label)), lambda: False
    )
    assert isinstance(result, SandboxSuccess)
    assert len(page_texts(result.outputs[0].path)) == 7
    assert_qpdf_ok(result.outputs[0].path)
    assert events and events[-1][0] == 1.0


def test_sandbox_reports_tool_errors(tmp_path: Path, inputs: list[InputFile]) -> None:
    result = run_in_sandbox(
        _sandbox_request(tmp_path, inputs, {"files": [{"pages": "99"}, {}]}), lambda *_: None, lambda: False
    )
    assert isinstance(result, SandboxError)
    assert result.code == "invalid_input" and "outside this document" in result.message


def test_sandbox_enforces_timeout_and_cancel(tmp_path: Path, inputs: list[InputFile]) -> None:
    timed_out = run_in_sandbox(
        _sandbox_request(tmp_path, inputs, {}, timeout=0), lambda *_: None, lambda: False
    )
    assert isinstance(timed_out, SandboxError) and timed_out.code == "timeout"
    cancelled = run_in_sandbox(_sandbox_request(tmp_path, inputs, {}), lambda *_: None, lambda: True)
    assert isinstance(cancelled, SandboxError) and cancelled.code == "cancelled"
