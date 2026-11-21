import zipfile
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

import filetype


class FileKind(StrEnum):
    PDF = "pdf"
    IMAGE = "image"
    DOCX = "docx"
    XLSX = "xlsx"
    PPTX = "pptx"
    DOC = "doc"
    XLS = "xls"
    PPT = "ppt"
    ODT = "odt"
    ODS = "ods"
    ODP = "odp"
    RTF = "rtf"
    EPUB = "epub"
    HTML = "html"
    MARKDOWN = "markdown"
    TEXT = "text"
    CSV = "csv"
    UNKNOWN = "unknown"


IMAGE_MIME_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/tiff",
        "image/bmp",
        "image/gif",
        "image/heic",
        "image/heif",
    }
)
TEXT_EXTENSIONS = {
    ".txt": (FileKind.TEXT, "text/plain"),
    ".md": (FileKind.MARKDOWN, "text/markdown"),
    ".markdown": (FileKind.MARKDOWN, "text/markdown"),
    ".html": (FileKind.HTML, "text/html"),
    ".htm": (FileKind.HTML, "text/html"),
    ".csv": (FileKind.CSV, "text/csv"),
}
OLE_EXTENSIONS = {
    ".doc": (FileKind.DOC, "application/msword"),
    ".xls": (FileKind.XLS, "application/vnd.ms-excel"),
    ".ppt": (FileKind.PPT, "application/vnd.ms-powerpoint"),
}
OOXML_MARKERS = (
    ("word/", FileKind.DOCX, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("xl/", FileKind.XLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ("ppt/", FileKind.PPTX, "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
)
ODF_MIMETYPES = {
    "application/vnd.oasis.opendocument.text": FileKind.ODT,
    "application/vnd.oasis.opendocument.spreadsheet": FileKind.ODS,
    "application/vnd.oasis.opendocument.presentation": FileKind.ODP,
    "application/epub+zip": FileKind.EPUB,
}
MAX_ZIP_ENTRIES = 20_000
MAX_ZIP_RATIO = 150
MAX_ZIP_UNCOMPRESSED = 2 * 1024 * 1024 * 1024


class UnsafeFileError(ValueError):
    pass


@dataclass(frozen=True)
class SniffResult:
    kind: FileKind
    mime_type: str


def _head(path: Path, size: int = 8192) -> bytes:
    with path.open("rb") as handle:
        return handle.read(size)


def _check_zip_safety(archive: zipfile.ZipFile, compressed_size: int) -> None:
    entries = archive.infolist()
    if len(entries) > MAX_ZIP_ENTRIES:
        raise UnsafeFileError("Archive contains too many entries")
    total = sum(max(entry.file_size, 0) for entry in entries)
    if total > MAX_ZIP_UNCOMPRESSED or total > max(compressed_size, 1) * MAX_ZIP_RATIO:
        raise UnsafeFileError("Archive expands to an unsafe size")


def _sniff_zip(path: Path) -> SniffResult | None:
    try:
        with zipfile.ZipFile(path) as archive:
            _check_zip_safety(archive, path.stat().st_size)
            names = archive.namelist()
            if "mimetype" in names:
                declared = archive.read("mimetype")[:100].decode("ascii", "ignore").strip()
                if declared in ODF_MIMETYPES:
                    return SniffResult(ODF_MIMETYPES[declared], declared)
            if "[Content_Types].xml" in names:
                for prefix, kind, mime in OOXML_MARKERS:
                    if any(name.startswith(prefix) for name in names):
                        return SniffResult(kind, mime)
    except zipfile.BadZipFile:
        return None
    return None


def _looks_like_text(sample: bytes) -> bool:
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError as exc:
        return exc.start >= len(sample) - 4
    return True


def sniff_file(path: Path, original_name: str) -> SniffResult:
    head = _head(path)
    suffix = Path(original_name).suffix.lower()
    stripped = head.lstrip(b"\xef\xbb\xbf\r\n\t ")
    if b"%PDF-" in head[:1024]:
        return SniffResult(FileKind.PDF, "application/pdf")
    if head.startswith(b"PK\x03\x04"):
        zipped = _sniff_zip(path)
        return zipped or SniffResult(FileKind.UNKNOWN, "application/zip")
    if head.startswith(b"{\\rtf"):
        return SniffResult(FileKind.RTF, "application/rtf")
    if head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        kind, mime = OLE_EXTENSIONS.get(suffix, (FileKind.UNKNOWN, "application/x-ole-storage"))
        return SniffResult(kind, mime)
    guess = filetype.guess(head)
    if guess is not None and guess.mime in IMAGE_MIME_TYPES:
        return SniffResult(FileKind.IMAGE, guess.mime)
    if guess is None and _looks_like_text(head):
        if suffix in TEXT_EXTENSIONS:
            kind, mime = TEXT_EXTENSIONS[suffix]
            return SniffResult(kind, mime)
        lowered = stripped[:200].lower()
        if lowered.startswith((b"<!doctype html", b"<html")):
            return SniffResult(FileKind.HTML, "text/html")
        return SniffResult(FileKind.TEXT, "text/plain")
    return SniffResult(FileKind.UNKNOWN, guess.mime if guess else "application/octet-stream")
