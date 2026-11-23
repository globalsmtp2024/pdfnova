import hashlib
from typing import Any

import pikepdf
import pypdfium2 as pdfium
from pydantic import Field, model_validator

from app.core.errors import ToolInputError
from app.files.hidden_data import HiddenKind, scan_hidden_data
from app.tools.base import InputFile, JobContext, OutputFile, Tool, ToolCategory, ToolOptions
from app.tools.batch import run_each
from app.tools.edit.metadata import clear_metadata
from app.tools.optimize.clean import CLEAN_SPEC
from app.tools.pdfkit import new_pdf_from_pages, open_pdf, output_pdf, pdf_name, save_pdf

MAX_FORM_DEPTH = 8
FINGERPRINT_SCALE = 0.5


class RemoveDuplicatesOptions(ToolOptions):
    compare: str = Field(default="appearance", pattern="^(appearance|text)$")


def page_fingerprint(document: pdfium.PdfDocument, index: int, compare: str) -> str:
    page = document[index]
    try:
        if compare == "text":
            textpage = page.get_textpage()
            try:
                text = " ".join(textpage.get_text_range().split())
            finally:
                textpage.close()
            return hashlib.sha256(text.encode("utf-8")).hexdigest()
        bitmap = page.render(scale=FINGERPRINT_SCALE).to_pil().convert("L")
        return hashlib.sha256(bitmap.tobytes() + str(bitmap.size).encode()).hexdigest()
    finally:
        page.close()


class RemoveDuplicatePagesTool(Tool[RemoveDuplicatesOptions]):
    slug = "remove-duplicate-pages"
    name = "Remove duplicate pages"
    category = ToolCategory.ORGANIZE
    summary = "Delete pages that repeat an earlier page exactly, keeping the first copy."
    input_spec = CLEAN_SPEC
    options_schema = RemoveDuplicatesOptions
    seconds_per_page = 0.08

    def run(self, ctx: JobContext[RemoveDuplicatesOptions]) -> list[OutputFile]:
        compare = ctx.options.compare

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            document = pdfium.PdfDocument(str(item.path))
            try:
                seen: set[str] = set()
                keep: list[int] = []
                count = len(document)
                for index in range(count):
                    ctx.ensure_not_cancelled()
                    ctx.report(index / count, f"Comparing page {index + 1}")
                    fingerprint = page_fingerprint(document, index, compare)
                    if fingerprint not in seen:
                        seen.add(fingerprint)
                        keep.append(index)
            finally:
                document.close()
            with open_pdf(item) as source:
                result, _mapping = new_pdf_from_pages(source, keep)
                with result:
                    target = ctx.output_path(pdf_name(f"{item.stem}-unique", "unique"))
                    save_pdf(result, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Comparing pages")


class RemoveImagesOptions(ToolOptions):
    pass


def is_image_xobject(resources: Any, name: str) -> bool:
    xobjects = resources.get("/XObject") if isinstance(resources, pikepdf.Dictionary) else None
    if not isinstance(xobjects, pikepdf.Dictionary) or name not in xobjects:
        return False
    return str(xobjects[name].get("/Subtype")) == "/Image"


def strip_images(pdf: pikepdf.Pdf, container: Any, resources: Any, depth: int) -> int:
    removed = 0
    kept: list[Any] = []
    for instruction in pikepdf.parse_content_stream(container):
        if isinstance(instruction, pikepdf.ContentStreamInlineImage):
            removed += 1
            continue
        operands, operator = instruction.operands, instruction.operator
        if str(operator) == "Do" and operands and is_image_xobject(resources, str(operands[0])):
            removed += 1
            continue
        kept.append(instruction)
    if removed:
        data = pikepdf.unparse_content_stream(kept)
        if isinstance(container, pikepdf.Page):
            container.obj["/Contents"] = pdf.make_stream(data)
        else:
            container.write(data)
    xobjects = resources.get("/XObject") if isinstance(resources, pikepdf.Dictionary) else None
    if isinstance(xobjects, pikepdf.Dictionary) and depth < MAX_FORM_DEPTH:
        for key in list(xobjects.keys()):
            form = xobjects[key]
            if str(form.get("/Subtype")) == "/Form":
                removed += strip_images(pdf, form, form.get("/Resources", resources), depth + 1)
    if isinstance(xobjects, pikepdf.Dictionary):
        for key in [k for k in list(xobjects.keys()) if str(xobjects[k].get("/Subtype")) == "/Image"]:
            del xobjects[key]
    return removed


class RemoveImagesTool(Tool[RemoveImagesOptions]):
    slug = "remove-images"
    name = "Remove images"
    category = ToolCategory.OPTIMIZE
    summary = "Strip every picture from a PDF and keep the text and vector drawings."
    input_spec = CLEAN_SPEC
    options_schema = RemoveImagesOptions
    seconds_per_page = 0.05

    def run(self, ctx: JobContext[RemoveImagesOptions]) -> list[OutputFile]:
        def handle(item: InputFile, _: int) -> list[OutputFile]:
            with open_pdf(item) as pdf:
                for index, page in enumerate(pdf.pages):
                    ctx.ensure_not_cancelled()
                    ctx.report(index / len(pdf.pages), f"Cleaning page {index + 1}")
                    resources = page.obj.get("/Resources", pikepdf.Dictionary())
                    strip_images(pdf, page, resources, 0)
                pdf.remove_unreferenced_resources()
                target = ctx.output_path(pdf_name(f"{item.stem}-no-images", "no-images"))
                save_pdf(pdf, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Removing images")


class RemoveHiddenDataOptions(ToolOptions):
    javascript: bool = True
    attachments: bool = True
    thumbnails: bool = True
    metadata: bool = True

    @model_validator(mode="after")
    def _something_selected(self) -> "RemoveHiddenDataOptions":
        if not (self.javascript or self.attachments or self.thumbnails or self.metadata):
            raise ToolInputError("Choose at least one kind of hidden data to remove.")
        return self


class RemoveHiddenDataTool(Tool[RemoveHiddenDataOptions]):
    slug = "remove-hidden-data"
    name = "Remove JavaScript and hidden data"
    category = ToolCategory.OPTIMIZE
    summary = "Remove scripts, embedded files, thumbnails and metadata before sharing a PDF."
    input_spec = CLEAN_SPEC
    options_schema = RemoveHiddenDataOptions
    seconds_per_page = 0.01

    def run(self, ctx: JobContext[RemoveHiddenDataOptions]) -> list[OutputFile]:
        options = ctx.options
        kinds: set[HiddenKind] = set()
        if options.javascript:
            kinds.add("javascript")
        if options.attachments:
            kinds.add("attachments")
        if options.thumbnails:
            kinds.add("thumbnails")

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            with open_pdf(item) as pdf:
                scan_hidden_data(pdf, frozenset(kinds))
                if options.metadata:
                    clear_metadata(pdf)
                target = ctx.output_path(pdf_name(f"{item.stem}-clean", "clean"))
                save_pdf(pdf, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Cleaning file")
