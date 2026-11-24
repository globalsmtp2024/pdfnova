from collections.abc import Sequence
from typing import Any, Literal

import pikepdf
from pikepdf import Name, String
from pydantic import Field, field_validator

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.text.fonts import FontKey
from app.text.geometry import multiply, page_geometry, stamp_matrix
from app.text.images import decode_image_data, prepare_image
from app.text.overlay import OverlayDocument, TextStyle, parse_hex_color
from app.tools.base import (
    InputFile,
    InputFileInfo,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolOptions,
)
from app.tools.edit.stamping import STAMP_SPEC, check_expression, checked_color, select_pages, stamp_each
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

SIGN_TEXT_SIZE = 48.0
TRUE_WORDS = {"on", "yes", "true", "1", "checked", "x"}


class SignOptions(ToolOptions):
    mode: Literal["text", "image"] = "text"
    text: str = Field(default="", max_length=120)
    font: FontKey = "noto-serif"
    color: str = "#1A237E"
    image_data: str | None = Field(default=None, max_length=14_000_000)
    pages: str = Field(default="last", max_length=2000)
    x_percent: float = Field(default=75.0, ge=0, le=100)
    y_percent: float = Field(default=12.0, ge=0, le=100)
    width_percent: float = Field(default=25.0, ge=3, le=100)
    opacity: float = Field(default=1.0, ge=0.1, le=1.0)

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        return checked_color(value)


class SignPdfTool(Tool[SignOptions]):
    slug = "sign"
    name = "Sign PDF"
    category = ToolCategory.SECURITY
    summary = "Place a typed, drawn or uploaded signature anywhere on your pages."
    input_spec = STAMP_SPEC
    options_schema = SignOptions
    seconds_per_page = 0.004

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: SignOptions) -> None:
        check_expression(files, options.pages)
        if options.mode == "text" and not options.text.strip():
            raise ToolInputError("Type your name to sign with.")
        if options.mode == "image" and not options.image_data:
            raise ToolInputError("Draw or upload a signature first.")

    def run(self, ctx: JobContext[SignOptions]) -> list[OutputFile]:
        options = ctx.options
        prepared = (
            prepare_image(decode_image_data(options.image_data))
            if options.mode == "image" and options.image_data
            else None
        )

        def stamper(pdf: pikepdf.Pdf, overlay: OverlayDocument, _: InputFile) -> int:
            chosen = select_pages(len(pdf.pages), options.pages, "all")
            for index in chosen:
                page = pdf.pages[index]
                geometry = page_geometry(page)
                target_width = geometry.visual_width * options.width_percent / 100
                if prepared is not None:
                    height = target_width * prepared.height / prepared.width
                    stamp = overlay.image_stamp(prepared, target_width, height, options.opacity)
                    scale = 1.0
                    width, height_used = stamp.width, stamp.height
                else:
                    style = TextStyle(
                        font=options.font,
                        size=SIGN_TEXT_SIZE,
                        color=parse_hex_color(options.color),
                        opacity=options.opacity,
                        bold=False,
                    )
                    stamp = overlay.text_stamp(options.text.strip(), style)
                    scale = target_width / stamp.width
                    width, height_used = stamp.width * scale, stamp.height * scale
                center = (
                    geometry.visual_width * options.x_percent / 100,
                    geometry.visual_height * options.y_percent / 100,
                )
                placement = stamp_matrix(geometry, center, width, height_used, 0.0)
                if scale != 1.0:
                    placement = multiply((scale, 0.0, 0.0, scale, 0.0, 0.0), placement)
                overlay.place(page, stamp, placement)
            return len(chosen)

        return stamp_each(ctx, stamper, "signed", "Signing file")


class FillFormOptions(ToolOptions):
    values: list[str] = Field(default_factory=list, max_length=2000)
    flatten: bool = False


def field_name(field: Any) -> str:
    parts: list[str] = []
    node: Any = field
    depth = 0
    while node is not None and depth < 32:
        title = node.get("/T")
        if title is not None:
            parts.append(str(title))
        node = node.get("/Parent")
        depth += 1
    return ".".join(reversed(parts))


def inherited(field: Any, key: str) -> Any:
    node: Any = field
    depth = 0
    while node is not None and depth < 32:
        value = node.get(key)
        if value is not None:
            return value
        node = node.get("/Parent")
        depth += 1
    return None


def terminal_fields(pdf: pikepdf.Pdf) -> list[Any]:
    acroform = pdf.Root.get("/AcroForm")
    if acroform is None or "/Fields" not in acroform:
        return []
    found: list[Any] = []
    stack: list[tuple[Any, int]] = [(field, 0) for field in acroform.Fields]
    while stack:
        field, depth = stack.pop()
        kids = field.get("/Kids")
        if kids is not None and depth < 32 and any("/T" in kid for kid in kids):
            stack.extend((kid, depth + 1) for kid in kids)
        else:
            found.append(field)
    return found


def on_state(field: Any) -> Name:
    kids = field.get("/Kids") or [field]
    for kid in kids:
        appearance = kid.get("/AP")
        if appearance is not None and "/N" in appearance:
            for key in appearance.N:
                if str(key) != "/Off":
                    return Name(str(key))
    return Name.Yes


def set_field(field: Any, value: str) -> None:
    kind = str(inherited(field, "/FT") or "")
    if kind == "/Btn":
        checked = value.strip().lower() in TRUE_WORDS
        state = on_state(field) if checked else Name.Off
        field.V = state
        for kid in field.get("/Kids") or [field]:
            kid.AS = state
        return
    field.V = String(value)
    for kid in field.get("/Kids") or [field]:
        if "/AP" in kid:
            del kid["/AP"]


class FillFormsTool(Tool[FillFormOptions]):
    slug = "fill-forms"
    name = "Fill PDF forms"
    category = ToolCategory.EDIT
    summary = "Fill in the fields of a PDF form, and list every field it contains."
    input_spec = InputSpec(
        min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = FillFormOptions
    seconds_per_page = 0.01

    def run(self, ctx: JobContext[FillFormOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        assignments: dict[str, str] = {}
        for line in options.values:
            if "=" not in line:
                raise ToolInputError(
                    f"“{line}” is not a field value.", hint="Write one per line: name = value"
                )
            name, value = (part.strip() for part in line.split("=", 1))
            assignments[name] = value
        with open_pdf(item) as pdf:
            fields = terminal_fields(pdf)
            if not fields:
                raise ToolInputError("This PDF has no fillable form fields.")
            by_name = {field_name(field): field for field in fields}
            unknown = [name for name in assignments if name not in by_name]
            if unknown:
                raise ToolInputError(
                    f"No field named “{unknown[0]}”.", hint="Available fields: " + ", ".join(sorted(by_name))
                )
            for name, value in assignments.items():
                set_field(by_name[name], value)
            if assignments:
                pdf.Root.AcroForm.NeedAppearances = True
                pdf.generate_appearance_streams()
            listing = [
                f"{name} ({str(inherited(field, '/FT') or '?')[1:]}) = {inherited(field, '/V')}"
                for name, field in sorted(by_name.items())
            ]
            if options.flatten:
                pdf.flatten_annotations("all")
                if "/AcroForm" in pdf.Root:
                    del pdf.Root["/AcroForm"]
            target = ctx.output_path(pdf_name(f"{item.stem}-filled", "filled"))
            save_pdf(pdf, target)
        report = ctx.output_path(f"{item.stem}-fields.txt")
        report.write_text("\n".join(listing) + "\n", encoding="utf-8")
        return [output_pdf(target), OutputFile(path=report, filename=report.name, mime_type="text/plain")]
