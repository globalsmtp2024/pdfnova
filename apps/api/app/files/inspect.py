from pathlib import Path
from typing import Any

import pikepdf

from app.files.metadata import read_metadata

POINTS_PER_MM = 72 / 25.4
SCAN_SAMPLE_PAGES = 10


class InspectionError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def page_rotation(page: pikepdf.Page) -> int:
    value: Any = page.obj.get("/Rotate")
    return int(value) % 360 if value is not None else 0


def _round(value: float) -> float:
    return round(value, 2)


def _permissions(pdf: pikepdf.Pdf) -> dict[str, bool]:
    allow = pdf.allow
    return {
        "print": bool(allow.print_lowres),
        "print_high_quality": bool(allow.print_highres),
        "copy": bool(allow.extract),
        "modify": bool(allow.modify_other),
        "annotate": bool(allow.modify_annotation),
        "fill_forms": bool(allow.modify_form),
        "accessibility": bool(allow.accessibility),
        "assemble": bool(allow.modify_assembly),
    }


def _scanned_pages(path: Path, limit: int) -> list[int]:
    import pypdfium2 as pdfium
    from pypdfium2 import raw

    scanned: list[int] = []
    document = pdfium.PdfDocument(str(path))
    try:
        for index in range(min(len(document), limit)):
            page = document[index]
            text = page.get_textpage()
            characters = text.count_chars()
            images = sum(1 for _ in page.get_objects(filter=[raw.FPDF_PAGEOBJ_IMAGE], max_depth=2))
            if characters == 0 and images > 0:
                scanned.append(index)
            text.close()
            page.close()
    finally:
        document.close()
    return scanned


def _string(info: Any, key: str) -> str | None:
    value = info.get(key) if info is not None else None
    return str(value) if value is not None else None


def inspect_document(path: Path, password: str | None = None) -> dict[str, Any]:
    try:
        pdf = pikepdf.open(path, password=password or "")
    except pikepdf.PasswordError as exc:
        raise InspectionError("PDF_ENCRYPTED", "This PDF needs a password to open.") from exc
    except pikepdf.PdfError as exc:
        raise InspectionError(
            "PDF_CORRUPT", "This PDF is damaged and can't be read. Try Repair PDF first."
        ) from exc
    with pdf:
        try:
            pages = []
            for page in pdf.pages:
                box = page.cropbox
                width = abs(float(box[2]) - float(box[0]))
                height = abs(float(box[3]) - float(box[1]))
                pages.append(
                    {
                        "width_pt": _round(width),
                        "height_pt": _round(height),
                        "width_mm": _round(width / POINTS_PER_MM),
                        "height_mm": _round(height / POINTS_PER_MM),
                        "rotation": page_rotation(page),
                    }
                )
            acroform: Any = pdf.Root.get("/AcroForm")
            fields: Any = acroform.get("/Fields") if acroform is not None else None
            names = pdf.Root.get("/Names")
            info = pdf.docinfo if "/Info" in pdf.trailer else None
            result: dict[str, Any] = {
                "page_count": len(pages),
                "pages": pages,
                "encrypted": pdf.is_encrypted,
                "permissions": _permissions(pdf),
                "has_forms": bool(fields is not None and len(fields) > 0),
                "has_bookmarks": "/Outlines" in pdf.Root and pdf.Root.Outlines.get("/First") is not None,
                "has_attachments": bool(
                    len(pdf.attachments) > 0 or (names is not None and "/EmbeddedFiles" in names)
                ),
                "producer": _string(info, "/Producer"),
                "creator": _string(info, "/Creator"),
                "title": _string(info, "/Title"),
                "pdf_version": pdf.pdf_version,
                "size_bytes": path.stat().st_size,
                "linearized": bool(pdf.is_linearized),
                "metadata": read_metadata(pdf),
            }
        except (pikepdf.PdfError, KeyError, ValueError, TypeError) as exc:
            raise InspectionError("PDF_UNSUPPORTED", "Parts of this PDF use features we can't read.") from exc
    if password:
        result["scanned_pages"] = []
    else:
        try:
            result["scanned_pages"] = _scanned_pages(path, SCAN_SAMPLE_PAGES)
        except Exception:
            result["scanned_pages"] = []
    sampled = min(result["page_count"], SCAN_SAMPLE_PAGES)
    result["scanned"] = sampled > 0 and len(result["scanned_pages"]) == sampled
    return result
