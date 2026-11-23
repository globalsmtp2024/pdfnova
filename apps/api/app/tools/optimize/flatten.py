from dataclasses import dataclass
from typing import Any, Literal

import pikepdf
from pydantic import model_validator

from app.files.hidden_data import array_items
from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.batch import run_each
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

AnnotationGroup = Literal["forms", "annotations", "stamps", "links"]
MAX_POPUP_PARENT_DEPTH = 8


class FlattenOptions(ToolOptions):
    forms: bool = True
    annotations: bool = True
    stamps: bool = True
    keep_links: bool = True

    @model_validator(mode="after")
    def _something_selected(self) -> "FlattenOptions":
        if not (self.forms or self.annotations or self.stamps):
            raise ValueError("Choose at least one of form fields, comments or stamps to flatten.")
        return self


@dataclass
class FlattenResult:
    flattened: int = 0
    removed: int = 0


def _subtype(annotation: pikepdf.Dictionary) -> str:
    value = annotation.get("/Subtype")
    return str(value) if isinstance(value, pikepdf.Name) else ""


def annotation_group(annotation: pikepdf.Dictionary) -> AnnotationGroup:
    current = annotation
    for _ in range(MAX_POPUP_PARENT_DEPTH):
        subtype = _subtype(current)
        parent = current.get("/Parent")
        if subtype == "/Popup" and isinstance(parent, pikepdf.Dictionary) and "/Subtype" in parent:
            current = parent
            continue
        break
    subtype = _subtype(current)
    if subtype == "/Widget":
        return "forms"
    if subtype == "/Stamp":
        return "stamps"
    if subtype == "/Link":
        return "links"
    return "annotations"


def _selected_groups(options: FlattenOptions) -> set[AnnotationGroup]:
    groups: set[AnnotationGroup] = set()
    if options.forms:
        groups.add("forms")
    if options.annotations:
        groups.add("annotations")
    if options.stamps:
        groups.add("stamps")
    return groups


def _is_leftover_to_drop(annotation: Any, groups: set[AnnotationGroup]) -> bool:
    if not isinstance(annotation, pikepdf.Dictionary):
        return True
    subtype = _subtype(annotation)
    if subtype == "/Widget":
        return "forms" in groups
    if subtype == "/Popup":
        return annotation_group(annotation) in groups
    return False


def flatten_document(pdf: pikepdf.Pdf, options: FlattenOptions) -> FlattenResult:
    groups = _selected_groups(options)
    result = FlattenResult()
    acroform = pdf.Root.get("/AcroForm")
    if options.forms and isinstance(acroform, pikepdf.Dictionary):
        try:
            pdf.generate_appearance_streams()
        except pikepdf.PdfError as exc:
            raise ToolFailedError("The form fields in this PDF are damaged and can't be flattened.") from exc
    held: list[tuple[pikepdf.Page, list[pikepdf.Dictionary], int]] = []
    for page in pdf.pages:
        annotations = page.obj.get("/Annots")
        if annotations is None:
            continue
        if not isinstance(annotations, pikepdf.Array):
            del page.obj["/Annots"]
            continue
        kept: list[pikepdf.Dictionary] = []
        chosen: list[pikepdf.Dictionary] = []
        for annotation in array_items(annotations):
            if not isinstance(annotation, pikepdf.Dictionary):
                result.removed += 1
                continue
            group = annotation_group(annotation)
            if group == "links":
                if options.keep_links:
                    kept.append(annotation)
                else:
                    result.removed += 1
            elif group in groups:
                chosen.append(annotation)
            else:
                kept.append(annotation)
        page.obj.Annots = pikepdf.Array(chosen)
        held.append((page, kept, len(chosen)))
    try:
        pdf.flatten_annotations("all")
    except pikepdf.PdfError as exc:
        raise ToolFailedError("Some annotations in this PDF are damaged and can't be flattened.") from exc
    for page, kept, chosen_count in held:
        leftover = array_items(page.obj.get("/Annots"))
        survivors = [item for item in leftover if not _is_leftover_to_drop(item, groups)]
        result.flattened += chosen_count - len(leftover)
        result.removed += len(leftover) - len(survivors)
        combined = [*kept, *survivors]
        if combined:
            page.obj.Annots = pikepdf.Array(combined)
        elif "/Annots" in page.obj:
            del page.obj["/Annots"]
    if options.forms:
        if "/AcroForm" in pdf.Root:
            del pdf.Root["/AcroForm"]
    elif acroform is not None:
        pdf.Root.AcroForm = acroform
    return result


class FlattenTool(Tool[FlattenOptions]):
    slug = "flatten"
    name = "Flatten PDF"
    category = ToolCategory.OPTIMIZE
    summary = "Burn form fields, comments and stamps into the page so they can no longer be edited."
    input_spec = InputSpec(
        min_files=1, max_files=100, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = FlattenOptions
    seconds_per_page = 0.004

    def run(self, ctx: JobContext[FlattenOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            with open_pdf(item) as pdf:
                flatten_document(pdf, options)
                target = ctx.output_path(pdf_name(f"{item.stem}-flattened", "flattened"))
                save_pdf(pdf, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Flattening file")
