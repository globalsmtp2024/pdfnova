import dataclasses
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

import pikepdf

from app.files.sniff import FileKind
from app.tools.base import InputFile, OutputFile, ToolFailedError, safe_filename

PDF_MIME = "application/pdf"


def open_pdf(source: InputFile | Path, password: str | None = None) -> pikepdf.Pdf:
    path = source.path if isinstance(source, InputFile) else source
    secret = source.password if isinstance(source, InputFile) and password is None else password
    try:
        return pikepdf.open(path, password=secret or "")
    except pikepdf.PasswordError as exc:
        name = source.original_name if isinstance(source, InputFile) else path.name
        message = (
            f"The password for {name} is not correct."
            if secret
            else f"{name} is password-protected. Enter its password to continue."
        )
        raise ToolFailedError(message, code="password_required") from exc
    except pikepdf.PdfError as exc:
        raise ToolFailedError("This PDF is damaged. Try Repair PDF first.", code="pdf_corrupt") from exc


def decrypt_inputs(inputs: list[InputFile], workdir: Path) -> list[InputFile]:
    result: list[InputFile] = []
    target_dir = workdir / "scratch" / "decrypted"
    for item in inputs:
        if item.kind is not FileKind.PDF or not item.encrypted:
            result.append(item)
            continue
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / item.path.name
        with open_pdf(item) as pdf:
            pdf.save(target)
        result.append(dataclasses.replace(item, path=target, encrypted=False, password=None))
    return result


def save_pdf(pdf: pikepdf.Pdf, target: Path, **options: Any) -> None:
    settings: dict[str, Any] = {
        "compress_streams": True,
        "object_stream_mode": pikepdf.ObjectStreamMode.generate,
    }
    settings.update(options)
    pdf.save(target, **settings)


def pdf_name(name: str, fallback: str) -> str:
    cleaned = safe_filename(name, fallback)
    return cleaned if cleaned.lower().endswith(".pdf") else f"{cleaned}.pdf"


def output_pdf(path: Path) -> OutputFile:
    return OutputFile(path=path, filename=path.name, mime_type=PDF_MIME)


def page_index_map(pdf: pikepdf.Pdf) -> dict[tuple[int, int], int]:
    return {page.obj.objgen: index for index, page in enumerate(pdf.pages)}


def resolve_destination_page(
    pdf: pikepdf.Pdf, destination: Any, index_by_objgen: dict[tuple[int, int], int]
) -> int | None:
    target: Any = destination
    if isinstance(target, (pikepdf.String, pikepdf.Name)):
        names = pdf.Root.get("/Names")
        dests = names.get("/Dests") if names is not None else None
        if dests is None:
            return None
        resolved = pikepdf.NameTree(dests).get(str(target))
        if resolved is None:
            return None
        target = resolved.get("/D") if isinstance(resolved, pikepdf.Dictionary) else resolved
    if isinstance(target, pikepdf.Array) and len(target) > 0:
        first = target[0]
        if isinstance(first, int):
            return first
        if isinstance(first, pikepdf.Dictionary):
            return index_by_objgen.get(first.objgen)
    return None


def outline_entries(pdf: pikepdf.Pdf) -> list[tuple[str, int | None, list[Any]]]:
    index_by_objgen = page_index_map(pdf)

    def convert(item: pikepdf.OutlineItem) -> tuple[str, int | None, list[Any]]:
        destination: Any = item.destination
        if destination is None and item.action is not None and item.action.get("/S") == pikepdf.Name.GoTo:
            destination = item.action.get("/D")
        page = resolve_destination_page(pdf, destination, index_by_objgen)
        return (str(item.title), page, [convert(child) for child in item.children])

    try:
        with pdf.open_outline() as outline:
            return [convert(item) for item in outline.root]
    except (pikepdf.OutlineStructureError, pikepdf.PdfError, KeyError, ValueError):
        return []


def rebuild_outline(
    target: pikepdf.Pdf, entries: Sequence[tuple[str, int | None, list[Any]]], mapping: dict[int, int]
) -> int:
    def build(entry: tuple[str, int | None, list[Any]]) -> pikepdf.OutlineItem | None:
        title, page, children = entry
        built_children = [child for child in (build(child) for child in children) if child is not None]
        if page is not None and page in mapping:
            item = pikepdf.OutlineItem(title, mapping[page])
        elif built_children:
            first = built_children[0].destination
            item = pikepdf.OutlineItem(title, first if isinstance(first, int) else 0)
        else:
            return None
        item.children.extend(built_children)
        return item

    built = [item for item in (build(entry) for entry in entries) if item is not None]
    if built:
        with target.open_outline() as outline:
            outline.root.extend(built)
    return len(built)


def copy_document_info(source: pikepdf.Pdf, target: pikepdf.Pdf) -> None:
    if "/Info" in source.trailer:
        for key, value in source.docinfo.items():
            if isinstance(value, pikepdf.String | pikepdf.Name):
                target.docinfo[key] = pikepdf.String(str(value))


def new_pdf_from_pages(
    source: pikepdf.Pdf, indices: Iterable[int], keep_outline: bool = True, keep_info: bool = True
) -> tuple[pikepdf.Pdf, dict[int, int]]:
    target = pikepdf.new()
    mapping: dict[int, int] = {}
    for position, index in enumerate(indices):
        target.pages.append(source.pages[index])
        mapping.setdefault(index, position)
    if keep_info:
        copy_document_info(source, target)
    if keep_outline:
        rebuild_outline(target, outline_entries(source), mapping)
    return target, mapping
