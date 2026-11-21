import zlib
from dataclasses import dataclass
from pathlib import Path

import pikepdf

from app.files.sniff import UnsafeFileError

MIN_DECODED_BUDGET = 512 * 1024 * 1024


@dataclass(frozen=True)
class PdfInspection:
    page_count: int | None
    encrypted: bool
    object_count: int


def _flate_decoded_length(raw: bytes, budget: int) -> int:
    decompressor = zlib.decompressobj()
    produced = 0
    data = raw
    while data:
        try:
            chunk = decompressor.decompress(data, max(budget - produced + 1, 1))
        except zlib.error:
            return produced
        produced += len(chunk)
        if produced > budget:
            return produced
        data = decompressor.unconsumed_tail
        if not chunk and data:
            break
    return produced


def _is_single_flate(stream: pikepdf.Stream) -> bool:
    filters = stream.get("/Filter")
    if filters is None:
        return False
    if isinstance(filters, pikepdf.Array):
        return len(filters) == 1 and str(filters[0]) == "/FlateDecode"
    return str(filters) == "/FlateDecode"


def inspect_pdf(
    path: Path,
    *,
    max_pages: int,
    max_objects: int,
    max_ratio: int,
    min_decoded_budget: int = MIN_DECODED_BUDGET,
) -> PdfInspection:
    file_size = path.stat().st_size
    budget = max(file_size * max_ratio, min_decoded_budget)
    try:
        pdf = pikepdf.open(path)
    except pikepdf.PasswordError:
        return PdfInspection(page_count=None, encrypted=True, object_count=0)
    except pikepdf.PdfError as exc:
        raise UnsafeFileError("This PDF is damaged and cannot be read") from exc
    with pdf:
        object_count = len(pdf.objects)
        if object_count > max_objects:
            raise UnsafeFileError("This PDF contains too many objects to process safely")
        page_count = len(pdf.pages)
        if page_count > max_pages:
            raise UnsafeFileError(f"This PDF has {page_count} pages; the maximum is {max_pages}")
        decoded_total = 0
        for obj in pdf.objects:
            if not isinstance(obj, pikepdf.Stream) or not _is_single_flate(obj):
                continue
            try:
                raw = obj.read_raw_bytes()
            except pikepdf.PdfError:
                continue
            decoded_total += _flate_decoded_length(raw, budget - decoded_total)
            if decoded_total > budget:
                raise UnsafeFileError("This PDF expands to an unsafe size when decompressed")
        return PdfInspection(page_count=page_count, encrypted=pdf.is_encrypted, object_count=object_count)
