import io
from typing import Any

import pikepdf
from pikepdf import PdfImage
from PIL import Image
from pydantic import Field

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolOptions,
)
from app.tools.batch import run_each
from app.tools.organize.page_tools import _is_blank
from app.tools.pdfkit import new_pdf_from_pages, open_pdf, output_pdf, pdf_name, save_pdf

CLEAN_SPEC = InputSpec(
    min_files=1, max_files=100, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)
COMMENT_SUBTYPES = frozenset(
    {
        "/Text",
        "/FreeText",
        "/Highlight",
        "/Underline",
        "/StrikeOut",
        "/Squiggly",
        "/Ink",
        "/Square",
        "/Circle",
        "/Line",
        "/Polygon",
        "/PolyLine",
        "/Stamp",
        "/Caret",
        "/FileAttachment",
        "/Popup",
        "/Redact",
    }
)
MAX_IMAGES = 5000


def luminance(red: float, green: float, blue: float) -> float:
    return 0.299 * red + 0.587 * green + 0.114 * blue


class GrayscaleOptions(ToolOptions):
    convert_images: bool = True
    convert_vector_colors: bool = True
    jpeg_quality: int = Field(default=88, ge=40, le=100)


def gray_content(page: pikepdf.Page) -> bytes | None:
    changed = False
    output: list[Any] = []
    try:
        instructions = pikepdf.parse_content_stream(page)
    except pikepdf.PdfError:
        return None
    for instruction in instructions:
        operands, operator = instruction.operands, str(instruction.operator)
        if operator in {"rg", "RG"} and len(operands) == 3:
            gray = luminance(*(float(value) for value in operands))
            output.append(
                pikepdf.ContentStreamInstruction(
                    [gray], pikepdf.Operator(operator[0].lower() if operator == "rg" else "G")
                )
            )
            changed = True
        elif operator in {"k", "K"} and len(operands) == 4:
            cyan, magenta, yellow, black = (float(value) for value in operands)
            gray = (1 - black) * luminance(1 - cyan, 1 - magenta, 1 - yellow)
            output.append(
                pikepdf.ContentStreamInstruction([gray], pikepdf.Operator("g" if operator == "k" else "G"))
            )
            changed = True
        else:
            output.append(instruction)
    return pikepdf.unparse_content_stream(output) if changed else None


def gray_images(pdf: pikepdf.Pdf, quality: int) -> int:
    converted = 0
    for page in pdf.pages:
        for name, raw in list(page.images.items()):
            if converted >= MAX_IMAGES:
                return converted
            if "/ImageMask" in raw and bool(raw.ImageMask):
                continue
            try:
                image = PdfImage(raw)
                if (
                    str(raw.get("/ColorSpace")) in {"/DeviceGray", "/CalGray"}
                    or image.colorspace == "/DeviceGray"
                ):
                    continue
                pil = image.as_pil_image().convert("L")
                buffer = io.BytesIO()
                pil.save(buffer, format="JPEG", quality=quality)
            except (NotImplementedError, ValueError, OSError, pikepdf.PdfError, Image.DecompressionBombError):
                continue
            for key in ("/Decode", "/DecodeParms"):
                if key in raw:
                    del raw[key]
            raw.write(buffer.getvalue(), filter=pikepdf.Name.DCTDecode)
            raw.ColorSpace = pikepdf.Name.DeviceGray
            raw.BitsPerComponent = 8
            converted += 1
            del name
    return converted


class GrayscaleTool(Tool[GrayscaleOptions]):
    slug = "grayscale"
    name = "Grayscale PDF"
    category = ToolCategory.OPTIMIZE
    summary = "Convert colours and images to shades of grey while keeping text selectable."
    input_spec = CLEAN_SPEC
    options_schema = GrayscaleOptions
    seconds_per_page = 0.03

    def run(self, ctx: JobContext[GrayscaleOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _index: int) -> list[OutputFile]:
            with open_pdf(item) as pdf:
                if options.convert_vector_colors:
                    for page in pdf.pages:
                        ctx.ensure_not_cancelled()
                        replaced = gray_content(page)
                        if replaced is not None:
                            page.obj.Contents = pdf.make_stream(replaced)
                if options.convert_images:
                    gray_images(pdf, options.jpeg_quality)
                target = ctx.output_path(pdf_name(f"{item.stem}-grayscale", "grayscale"))
                save_pdf(pdf, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Converting file")


class RemoveAnnotationsOptions(ToolOptions):
    remove_comments: bool = True
    remove_links: bool = False
    remove_form_fields: bool = False


def strip_annotations(pdf: pikepdf.Pdf, options: RemoveAnnotationsOptions) -> int:
    removed = 0
    for page in pdf.pages:
        annotations = page.obj.get("/Annots")
        if annotations is None:
            continue
        kept = []
        for annotation in annotations:
            subtype = str(annotation.get("/Subtype", ""))
            drop = (
                (options.remove_comments and subtype in COMMENT_SUBTYPES)
                or (options.remove_links and subtype == "/Link")
                or (options.remove_form_fields and subtype == "/Widget")
            )
            if drop:
                removed += 1
            else:
                kept.append(annotation)
        if kept:
            page.obj.Annots = pikepdf.Array(kept)
        else:
            del page.obj["/Annots"]
    if options.remove_form_fields and "/AcroForm" in pdf.Root:
        del pdf.Root["/AcroForm"]
    return removed


class RemoveAnnotationsTool(Tool[RemoveAnnotationsOptions]):
    slug = "remove-annotations"
    name = "Remove annotations"
    category = ToolCategory.OPTIMIZE
    summary = "Strip comments, highlights, stamps and optionally links or form fields."
    input_spec = CLEAN_SPEC
    options_schema = RemoveAnnotationsOptions
    seconds_per_page = 0.004

    def run(self, ctx: JobContext[RemoveAnnotationsOptions]) -> list[OutputFile]:
        options = ctx.options
        if not (options.remove_comments or options.remove_links or options.remove_form_fields):
            raise ToolInputError("Choose at least one kind of annotation to remove.")

        def handle(item: InputFile, _index: int) -> list[OutputFile]:
            with open_pdf(item) as pdf:
                strip_annotations(pdf, options)
                target = ctx.output_path(pdf_name(f"{item.stem}-clean", "clean"))
                save_pdf(pdf, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Cleaning file")


class RemoveBlankOptions(ToolOptions):
    sensitivity: float = Field(default=0.995, ge=0.9, le=1.0)
    keep_pages_with_text: bool = True


class RemoveBlankPagesTool(Tool[RemoveBlankOptions]):
    slug = "remove-blank-pages"
    name = "Remove blank pages"
    category = ToolCategory.OPTIMIZE
    summary = "Detect and delete empty pages, such as scanner leftovers and separators."
    input_spec = CLEAN_SPEC
    options_schema = RemoveBlankOptions
    seconds_per_page = 0.06

    def run(self, ctx: JobContext[RemoveBlankOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _index: int) -> list[OutputFile]:
            with open_pdf(item) as source:
                count = len(source.pages)
                keep: list[int] = []
                for index in range(count):
                    ctx.ensure_not_cancelled()
                    ctx.report(index / count, f"Checking page {index + 1}")
                    if not _is_blank(str(item.path), index, options.sensitivity):
                        keep.append(index)
                if not keep:
                    raise ToolInputError("Every page looks blank, so nothing was removed.")
                result, _ = new_pdf_from_pages(source, keep)
                with result:
                    target = ctx.output_path(pdf_name(f"{item.stem}-no-blanks", "no-blanks"))
                    save_pdf(result, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Scanning file")


class ReverseOptions(ToolOptions):
    pass


class ReversePagesTool(Tool[ReverseOptions]):
    slug = "reverse-pages"
    name = "Reverse pages"
    category = ToolCategory.ORGANIZE
    summary = "Flip the page order so the last page comes first."
    input_spec = CLEAN_SPEC
    options_schema = ReverseOptions
    seconds_per_page = 0.002

    def run(self, ctx: JobContext[ReverseOptions]) -> list[OutputFile]:
        def handle(item: InputFile, _index: int) -> list[OutputFile]:
            with open_pdf(item) as source:
                result, _ = new_pdf_from_pages(source, list(range(len(source.pages)))[::-1])
                with result:
                    target = ctx.output_path(pdf_name(f"{item.stem}-reversed", "reversed"))
                    save_pdf(result, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Reversing file")


class LinearizeOptions(ToolOptions):
    pass


class LinearizeTool(Tool[LinearizeOptions]):
    slug = "linearize"
    name = "Linearize PDF"
    category = ToolCategory.OPTIMIZE
    summary = "Optimise a PDF for fast web viewing so page one appears before the download ends."
    input_spec = CLEAN_SPEC
    options_schema = LinearizeOptions
    seconds_per_page = 0.003

    def run(self, ctx: JobContext[LinearizeOptions]) -> list[OutputFile]:
        def handle(item: InputFile, _index: int) -> list[OutputFile]:
            with open_pdf(item) as pdf:
                target = ctx.output_path(pdf_name(f"{item.stem}-web", "web"))
                save_pdf(pdf, target, linearize=True)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Linearizing file")
