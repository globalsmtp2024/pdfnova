from collections.abc import Iterator
from dataclasses import asdict, dataclass
from typing import Any, Literal

import pikepdf

HiddenKind = Literal["attachments", "javascript", "thumbnails"]
MAX_ACTION_CHAIN = 32
MAX_FIELD_DEPTH = 64


@dataclass
class HiddenDataCounts:
    attachments: int = 0
    javascript: int = 0
    thumbnails: int = 0

    def as_dict(self) -> dict[str, int]:
        return asdict(self)


def _name(value: Any) -> str | None:
    return str(value) if isinstance(value, pikepdf.Name) else None


def array_items(value: Any) -> list[Any]:
    if not isinstance(value, pikepdf.Array):
        return []
    return [value[index] for index in range(len(value))]


def _name_tree_size(node: Any) -> int:
    if not isinstance(node, pikepdf.Dictionary):
        return 0
    try:
        return len(pikepdf.NameTree(node))
    except (pikepdf.PdfError, TypeError, ValueError, KeyError):
        return 1


def _is_javascript(action: Any, depth: int = 0) -> bool:
    if depth > MAX_ACTION_CHAIN:
        return False
    if isinstance(action, pikepdf.Array):
        return any(_is_javascript(item, depth + 1) for item in array_items(action))
    if not isinstance(action, pikepdf.Dictionary):
        return False
    if _name(action.get("/S")) == "/JavaScript" or "/JS" in action:
        return True
    return _is_javascript(action.get("/Next"), depth + 1)


def _additional_actions(holder: Any, remove: bool) -> int:
    actions = holder.get("/AA")
    if not isinstance(actions, pikepdf.Dictionary):
        return 0
    script_keys = [key for key in list(actions.keys()) if _is_javascript(actions.get(key))]
    if remove:
        for key in script_keys:
            del actions[key]
        if len(actions.keys()) == 0:
            del holder["/AA"]
    return len(script_keys)


def _fields(pdf: pikepdf.Pdf) -> Iterator[pikepdf.Dictionary]:
    form = pdf.Root.get("/AcroForm")
    roots = form.get("/Fields") if isinstance(form, pikepdf.Dictionary) else None
    seen: set[tuple[int, int]] = set()
    pending: list[tuple[Any, int]] = [(field, 0) for field in array_items(roots)]
    while pending:
        field, depth = pending.pop()
        if not isinstance(field, pikepdf.Dictionary) or depth > MAX_FIELD_DEPTH:
            continue
        if field.is_indirect:
            if field.objgen in seen:
                continue
            seen.add(field.objgen)
        yield field
        kids = field.get("/Kids")
        pending.extend((kid, depth + 1) for kid in array_items(kids))


def _scan_javascript(pdf: pikepdf.Pdf, remove: bool) -> int:
    count = 0
    root = pdf.Root
    names = root.get("/Names")
    if isinstance(names, pikepdf.Dictionary) and "/JavaScript" in names:
        count += max(_name_tree_size(names.get("/JavaScript")), 1)
        if remove:
            del names["/JavaScript"]
    if _is_javascript(root.get("/OpenAction")):
        count += 1
        if remove:
            del root["/OpenAction"]
    count += _additional_actions(root, remove)
    seen: set[tuple[int, int]] = set()
    for page in pdf.pages:
        page_object: Any = page.obj
        count += _additional_actions(page_object, remove)
        for annotation in array_items(page.obj.get("/Annots")):
            if not isinstance(annotation, pikepdf.Dictionary):
                continue
            if annotation.is_indirect:
                if annotation.objgen in seen:
                    continue
                seen.add(annotation.objgen)
            if _is_javascript(annotation.get("/A")):
                count += 1
                if remove:
                    del annotation["/A"]
            count += _additional_actions(annotation, remove)
    for field in _fields(pdf):
        if field.is_indirect and field.objgen in seen:
            continue
        count += _additional_actions(field, remove)
    return count


def _scan_attachments(pdf: pikepdf.Pdf, remove: bool) -> int:
    count = 0
    root = pdf.Root
    names = root.get("/Names")
    if isinstance(names, pikepdf.Dictionary) and "/EmbeddedFiles" in names:
        count += _name_tree_size(names.get("/EmbeddedFiles"))
        if remove:
            del names["/EmbeddedFiles"]
    if remove:
        for key in ("/AF", "/Collection"):
            if key in root:
                del root[key]
    for page in pdf.pages:
        annotations = array_items(page.obj.get("/Annots"))
        kept = [
            annotation
            for annotation in annotations
            if not (
                isinstance(annotation, pikepdf.Dictionary)
                and _name(annotation.get("/Subtype")) == "/FileAttachment"
            )
        ]
        count += len(annotations) - len(kept)
        if remove and len(kept) != len(annotations):
            page.obj.Annots = pikepdf.Array(kept)
    return count


def _scan_thumbnails(pdf: pikepdf.Pdf, remove: bool) -> int:
    count = 0
    for page in pdf.pages:
        if "/Thumb" in page.obj:
            count += 1
            if remove:
                del page.obj["/Thumb"]
    return count


def scan_hidden_data(pdf: pikepdf.Pdf, remove: frozenset[HiddenKind] = frozenset()) -> HiddenDataCounts:
    return HiddenDataCounts(
        attachments=_scan_attachments(pdf, "attachments" in remove),
        javascript=_scan_javascript(pdf, "javascript" in remove),
        thumbnails=_scan_thumbnails(pdf, "thumbnails" in remove),
    )
