from typing import Any

import pikepdf

from app.files.hidden_data import scan_hidden_data

STANDARD_INFO_KEYS: dict[str, str] = {
    "title": "/Title",
    "author": "/Author",
    "subject": "/Subject",
    "keywords": "/Keywords",
    "creator": "/Creator",
    "producer": "/Producer",
    "creation_date": "/CreationDate",
    "modification_date": "/ModDate",
}
RESERVED_INFO_KEYS = frozenset({*STANDARD_INFO_KEYS.values(), "/Trapped"})
MAX_REPORTED_CUSTOM = 50
MAX_REPORTED_LENGTH = 2000


def _text(value: Any) -> str | None:
    if isinstance(value, pikepdf.String | pikepdf.Name):
        return str(value)[:MAX_REPORTED_LENGTH]
    return None


def read_metadata(pdf: pikepdf.Pdf) -> dict[str, Any]:
    found = pdf.trailer.get("/Info")
    has_info = isinstance(found, pikepdf.Dictionary)
    info: Any = found if has_info else pikepdf.Dictionary()
    fields = {name: _text(info.get(key)) for name, key in STANDARD_INFO_KEYS.items()}
    custom: dict[str, str] = {}
    if has_info:
        for key in list(info.keys()):
            if key in RESERVED_INFO_KEYS or len(custom) >= MAX_REPORTED_CUSTOM:
                continue
            value = _text(info.get(key))
            if value is not None:
                custom[key[1:]] = value
    xmp_pages = sum(1 for page in pdf.pages if "/Metadata" in page.obj)
    return {
        **fields,
        "custom": custom,
        "has_info": has_info and len(info.keys()) > 0,
        "has_xmp": "/Metadata" in pdf.Root,
        "pages_with_xmp": xmp_pages,
        "hidden": scan_hidden_data(pdf).as_dict(),
    }
