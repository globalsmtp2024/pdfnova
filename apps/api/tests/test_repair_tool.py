import re
from pathlib import Path
from typing import Any

import pikepdf
import pypdfium2 as pdfium
import pytest

from app.files.pdf_safety import DamagedPdfError, inspect_damaged_pdf, inspect_pdf
from app.files.sniff import FileKind, UnsafeFileError
from app.tools.base import InputFile, InputFileInfo, JobContext, OutputFile, ToolFailedError
from app.tools.optimize.repair import (
    RepairTool,
    _rasterize_into,
    estimate_pages,
    structural_findings,
)
from app.tools.registry import get_registry
from tests.pdf_factory import corrupt_variants, make_flate_bomb_pdf, make_pdf, page_texts
from tests.qpdf_check import assert_qpdf_ok

PAGES = 6
LIMITS: dict[str, Any] = {"max_pages": 5000, "max_objects": 2_000_000, "max_ratio": 200}


def _plain_pdf(directory: Path, pages: int = PAGES) -> bytes:
    source = make_pdf(directory / "source.pdf", pages, "Repair")
    target = directory / "plain.pdf"
    with pikepdf.open(source) as pdf:
        pdf.save(
            target,
            compress_streams=False,
            stream_decode_level=pikepdf.StreamDecodeLevel.generalized,
            object_stream_mode=pikepdf.ObjectStreamMode.disable,
        )
    return target.read_bytes()


def _shift_offsets(data: bytes) -> bytes:
    start = data.rfind(b"\nxref")
    end = data.find(b"trailer", start)
    table = re.sub(
        rb"(\d{10}) 00000 n",
        lambda match: b"%010d 00000 n" % (int(match.group(1)) + 7),
        data[start:end],
    )
    return data[:start] + table + data[end:]


def _wrong_length(data: bytes) -> bytes:
    match = re.search(rb"/Length (\d+)", data)
    assert match is not None
    return data[: match.start(1)] + str(int(match.group(1)) + 41).encode() + data[match.end(1) :]


def _missing_endobj(data: bytes) -> bytes:
    page = re.search(rb"/Type /Page\b", data)
    assert page is not None
    marker = data.find(b"endobj", page.end())
    return data[:marker] + data[marker + len(b"endobj") :]


def damaged_fixtures(directory: Path) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    plain = _plain_pdf(directory)
    variants = {
        "bad_xref_offsets": _shift_offsets(plain) + b"\n%garbage\x00\xff" * 30,
        "wrong_stream_length": _wrong_length(plain),
        "missing_endobj": _missing_endobj(plain),
        "plain_truncated": plain[: plain.rfind(b"xref")],
    }
    paths = dict(corrupt_variants(directory / "factory"))
    for name, data in variants.items():
        paths[name] = directory / f"{name}.pdf"
        paths[name].write_bytes(data)
    return paths


def _input(path: Path) -> InputFile:
    return InputFile(
        path=path,
        original_name="client-ledger.pdf",
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=path.stat().st_size,
        page_count=None,
    )


def _repair(tmp_path: Path, path: Path, **options: object) -> tuple[Path, str, str]:
    tool = RepairTool()
    parsed = tool.parse_options(dict(options))
    item = _input(path)
    tool.validate_inputs([InputFileInfo(item.original_name, item.size_bytes, item.kind, None)], parsed)
    labels: list[str] = []
    ctx = JobContext(
        workdir=tmp_path / f"work-{path.stem}",
        inputs=[item],
        options=parsed,
        reporter=lambda _fraction, label: labels.append(label),
    )
    outputs: list[OutputFile] = tool.run(ctx)
    assert [output.filename for output in outputs] == ["client-ledger-repaired.pdf", "repair-report.txt"]
    assert_qpdf_ok(outputs[0].path)
    report = outputs[1].path.read_text(encoding="utf-8")
    assert outputs[1].mime_type == "text/plain"
    return outputs[0].path, report, labels[-1]


def _page_count(path: Path) -> int:
    with pikepdf.open(path) as pdf:
        return len(pdf.pages)


@pytest.fixture(scope="module")
def fixtures(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    return damaged_fixtures(tmp_path_factory.mktemp("damaged"))


def test_registered() -> None:
    tool = get_registry().get("repair")
    assert isinstance(tool, RepairTool)
    assert tool.input_spec.allow_damaged_pdf


@pytest.mark.parametrize(
    "variant",
    [
        "bad_xref_offsets",
        "wrong_stream_length",
        "missing_endobj",
        "garbage_appended",
        "bad_xref",
        "no_trailer",
    ],
)
def test_recovers_every_page_with_text(tmp_path: Path, fixtures: dict[str, Path], variant: str) -> None:
    repaired, report, summary = _repair(tmp_path, fixtures[variant])
    assert _page_count(repaired) == PAGES
    texts = page_texts(repaired)
    for number in range(1, PAGES + 1):
        assert f"Repair page {number}" in texts[number - 1]
    assert f"Recovered all {PAGES} pages." in summary
    assert "No problems found" not in summary
    assert f"Pages in the repaired file: {PAGES}" in report
    assert "client-ledger" not in report


def test_rebuilds_cross_reference_table(tmp_path: Path, fixtures: dict[str, Path]) -> None:
    _, report, summary = _repair(tmp_path, fixtures["bad_xref_offsets"])
    assert "Rebuilt the cross-reference table." in summary
    assert "unexpected data after the end of the file" in report
    assert "Technical details:" in report


def test_reports_wrong_stream_length(tmp_path: Path, fixtures: dict[str, Path]) -> None:
    _, report, _ = _repair(tmp_path, fixtures["wrong_stream_length"])
    assert "/Length was wrong" in report


def test_reports_missing_trailer(tmp_path: Path, fixtures: dict[str, Path]) -> None:
    _, report, _ = _repair(tmp_path, fixtures["no_trailer"])
    assert "trailer dictionary was missing" in report


@pytest.mark.parametrize("variant", ["truncated", "plain_truncated"])
def test_truncated_file_reports_page_totals(tmp_path: Path, fixtures: dict[str, Path], variant: str) -> None:
    repaired, report, summary = _repair(tmp_path, fixtures[variant])
    recovered = _page_count(repaired)
    assert 0 < recovered <= PAGES
    assert "truncated" in report
    if recovered < PAGES:
        assert f"Recovered {recovered} of {PAGES} pages" in summary
        assert "could not be recovered" in summary
    else:
        assert f"Recovered all {PAGES} pages." in summary
    texts = page_texts(repaired)
    assert "Repair page 1" in texts[0]


def test_reports_unrecoverable_pages_against_page_tree(tmp_path: Path) -> None:
    plain = _plain_pdf(tmp_path, 4)
    pages = [
        match
        for match in re.finditer(rb"\d+ 0 obj.*?endobj", plain, re.DOTALL)
        if re.search(rb"/Type /Page\b", match.group(0))
    ]
    assert len(pages) == 4
    start, end = pages[2].span()
    damaged = plain[:start] + b" " * (end - start) + plain[end:]
    path = tmp_path / "lost-page.pdf"
    path.write_bytes(damaged.replace(b"startxref", b"startxrex"))
    repaired, report, summary = _repair(tmp_path, path)
    assert _page_count(repaired) == 3
    assert "Recovered 3 of 4 pages" in summary
    assert "Expected pages: 4" in report


def test_healthy_file_reports_no_problems(tmp_path: Path) -> None:
    healthy = make_pdf(tmp_path / "healthy.pdf", 3, "Fine")
    repaired, report, summary = _repair(tmp_path, healthy)
    assert summary == "No problems found. All 3 pages were saved as a clean copy."
    assert "- No problems found." in report
    assert _page_count(repaired) == 3
    assert "Fine page 2" in page_texts(repaired)[1]


def test_unrecoverable_file_fails_clearly(tmp_path: Path) -> None:
    path = tmp_path / "hopeless.pdf"
    path.write_bytes(b"%PDF-1.7\n" + b"\x00\x13garbage" * 200)
    with pytest.raises(ToolFailedError, match="Nothing could be recovered"):
        _repair(tmp_path, path)


def test_page_estimate_sources(fixtures: dict[str, Path]) -> None:
    path = fixtures["plain_truncated"]
    estimate = estimate_pages(path, path.read_bytes())
    assert estimate.declared == PAGES
    assert estimate.page_objects == PAGES
    assert estimate.best == PAGES


def test_structural_findings_on_healthy_bytes(tmp_path: Path) -> None:
    assert structural_findings(make_pdf(tmp_path / "ok.pdf", 1).read_bytes()) == []


def test_damaged_upload_inspection(fixtures: dict[str, Path]) -> None:
    path = fixtures["truncated"]
    with pytest.raises(DamagedPdfError):
        inspect_pdf(path, **LIMITS)
    inspection = inspect_damaged_pdf(path, **LIMITS)
    assert inspection.page_count is None
    assert inspection.object_count > 0


def test_damaged_inspection_still_requires_pdf_header(tmp_path: Path) -> None:
    path = tmp_path / "fake.pdf"
    path.write_bytes(b"x" * 2048 + b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n")
    with pytest.raises(UnsafeFileError, match="not a PDF"):
        inspect_damaged_pdf(path, **LIMITS)


def test_damaged_inspection_blocks_decompression_bombs(tmp_path: Path) -> None:
    bomb = make_flate_bomb_pdf(tmp_path / "bomb.pdf", 64)
    data = bomb.read_bytes()
    damaged = tmp_path / "damaged-bomb.pdf"
    damaged.write_bytes(data[: data.rfind(b"xref")])
    with pytest.raises(UnsafeFileError, match="unsafe size"):
        inspect_damaged_pdf(damaged, **{**LIMITS, "min_decoded_budget": 1024 * 1024})


def test_damaged_inspection_enforces_page_and_object_limits(fixtures: dict[str, Path]) -> None:
    path = fixtures["truncated"]
    with pytest.raises(UnsafeFileError, match="too many objects"):
        inspect_damaged_pdf(path, **{**LIMITS, "max_objects": 2})
    with pytest.raises(UnsafeFileError, match="maximum is 1"):
        inspect_damaged_pdf(path, **{**LIMITS, "max_pages": 1})


def test_rasterize_fallback_keeps_page_size(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "raster-source.pdf", 2, "Raster")
    document = pdfium.PdfDocument(str(source))
    rebuilt = pdfium.PdfDocument.new()
    try:
        assert _rasterize_into(document, 1, rebuilt, tmp_path)
        assert len(rebuilt) == 1
        width, height = rebuilt[0].get_size()
        assert abs(width - 595.28) < 1 and abs(height - 841.89) < 1
        target = tmp_path / "raster.pdf"
        rebuilt.save(str(target))
    finally:
        rebuilt.close()
        document.close()
    assert_qpdf_ok(target)
