import zipfile
from pathlib import Path

import pytest

from app.core.errors import ToolInputError
from app.files.pdf_safety import inspect_pdf
from app.files.sniff import FileKind, UnsafeFileError, sniff_file
from app.tools.pages import parse_page_ranges
from tests.pdf_factory import make_encrypted_pdf, make_flate_bomb_pdf, make_pdf, png_bytes

LIMITS = {"max_pages": 5000, "max_objects": 2_000_000, "max_ratio": 200}


def _write(path: Path, data: bytes) -> Path:
    path.write_bytes(data)
    return path


def _ooxml(path: Path, folder: str) -> Path:
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr(f"{folder}/document.xml", "<doc/>")
    return path


def test_sniff_detects_formats(fixtures_dir: Path) -> None:
    assert sniff_file(make_pdf(fixtures_dir / "a.pdf", 1), "a.pdf").kind is FileKind.PDF
    assert sniff_file(make_pdf(fixtures_dir / "noext", 1), "renamed.txt").kind is FileKind.PDF
    png = sniff_file(_write(fixtures_dir / "i.png", png_bytes()), "photo.jpg")
    assert png.kind is FileKind.IMAGE and png.mime_type == "image/png"
    assert sniff_file(_ooxml(fixtures_dir / "d.docx", "word"), "d.docx").kind is FileKind.DOCX
    assert sniff_file(_ooxml(fixtures_dir / "x.bin", "xl"), "x.bin").kind is FileKind.XLSX
    assert sniff_file(_ooxml(fixtures_dir / "p.pptx", "ppt"), "p.pptx").kind is FileKind.PPTX
    epub = fixtures_dir / "b.epub"
    with zipfile.ZipFile(epub, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip")
        archive.writestr("content.opf", "<package/>")
    assert sniff_file(epub, "b.epub").kind is FileKind.EPUB
    assert (
        sniff_file(_write(fixtures_dir / "n.md", "# Title\nسلام".encode()), "n.md").kind is FileKind.MARKDOWN
    )
    assert (
        sniff_file(_write(fixtures_dir / "page", b"<!DOCTYPE html><html></html>"), "page").kind
        is FileKind.HTML
    )
    assert sniff_file(_write(fixtures_dir / "t.csv", b"a,b\n1,2\n"), "t.csv").kind is FileKind.CSV
    assert sniff_file(_write(fixtures_dir / "r.rtf", b"{\\rtf1 hello}"), "r.rtf").kind is FileKind.RTF
    assert (
        sniff_file(_write(fixtures_dir / "x.exe", b"MZ\x90\x00\x03" + b"\x00" * 200), "x.pdf").kind
        is FileKind.UNKNOWN
    )


def test_sniff_rejects_zip_bomb(fixtures_dir: Path) -> None:
    bomb = fixtures_dir / "bomb.docx"
    with zipfile.ZipFile(bomb, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", b"\x00" * (50 * 1024 * 1024))
    with pytest.raises(UnsafeFileError):
        sniff_file(bomb, "bomb.docx")


def test_inspect_pdf_reports_pages_and_encryption(fixtures_dir: Path) -> None:
    result = inspect_pdf(make_pdf(fixtures_dir / "five.pdf", 5), **LIMITS)
    assert result.page_count == 5 and not result.encrypted
    locked = inspect_pdf(make_encrypted_pdf(fixtures_dir / "locked.pdf"), **LIMITS)
    assert locked.encrypted and locked.page_count is None


def test_inspect_pdf_rejects_unsafe_documents(fixtures_dir: Path) -> None:
    with pytest.raises(UnsafeFileError, match="pages"):
        inspect_pdf(make_pdf(fixtures_dir / "many.pdf", 6), max_pages=5, max_objects=10_000, max_ratio=200)
    bomb = make_flate_bomb_pdf(fixtures_dir / "bomb.pdf", decoded_megabytes=64)
    with pytest.raises(UnsafeFileError, match="unsafe size"):
        inspect_pdf(bomb, max_pages=10, max_objects=1000, max_ratio=1, min_decoded_budget=16 * 1024 * 1024)
    assert inspect_pdf(bomb, max_pages=10, max_objects=1000, max_ratio=1).page_count == 1
    broken = _write(fixtures_dir / "broken.pdf", b"%PDF-1.7\n garbage without structure")
    with pytest.raises(UnsafeFileError, match="damaged"):
        inspect_pdf(broken, **LIMITS)


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        (None, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
        ("all", list(range(10))),
        ("1-3,5", [0, 1, 2, 4]),
        ("8-", [7, 8, 9]),
        ("-2", [0, 1]),
        ("last", [9]),
        ("3-1", [2, 1, 0]),
        ("2, 2 ,last-9", [1, 1, 9, 8]),
    ],
)
def test_parse_page_ranges(expression: str | None, expected: list[int]) -> None:
    assert parse_page_ranges(expression, 10) == expected


@pytest.mark.parametrize("expression", ["0", "11", "abc", "1-x", "5-12", ","])
def test_parse_page_ranges_rejects_invalid(expression: str) -> None:
    with pytest.raises(ToolInputError):
        parse_page_ranges(expression, 10)
