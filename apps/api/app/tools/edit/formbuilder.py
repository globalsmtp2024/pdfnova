import re
from collections.abc import Sequence
from typing import Annotated, Literal

import pdfplumber
import pikepdf
from pydantic import BaseModel, ConfigDict, Field

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.text.geometry import PageGeometry, page_geometry
from app.tools.base import (
    InputFileInfo,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.edit.editor import user_rect
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

MAX_FIELDS = 500
FIELD_NAME = r"^[A-Za-z][A-Za-z0-9_.\-]{0,63}$"
FLAG_REQUIRED = 1 << 1
FLAG_READONLY = 1
FLAG_MULTILINE = 1 << 12
FLAG_RADIO = 1 << 15
FLAG_NO_TOGGLE_OFF = 1 << 14
FLAG_COMBO = 1 << 17
PRINT_FLAG = 4
Percent = Annotated[float, Field(ge=0, le=100)]
FieldKind = Literal["text", "multiline", "checkbox", "radio", "dropdown", "signature"]


class FormFieldSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: FieldKind
    name: str = Field(pattern=FIELD_NAME)
    page: int = Field(ge=1, le=100000)
    x: Percent
    y: Percent
    width: float = Field(ge=0.5, le=100)
    height: float = Field(ge=0.5, le=100)
    value: str = Field(default="", max_length=2000)
    choices: list[str] = Field(default_factory=list, max_length=200)
    export_value: str = Field(default="Yes", max_length=60)
    tooltip: str = Field(default="", max_length=300)
    required: bool = False
    read_only: bool = False
    font_size: float = Field(default=0.0, ge=0, le=72)
    max_length: int = Field(default=0, ge=0, le=100000)


class CreateFormOptions(ToolOptions):
    fields: list[FormFieldSpec] = Field(min_length=1, max_length=MAX_FIELDS)


def ensure_acroform(pdf: pikepdf.Pdf) -> pikepdf.Dictionary:
    form = pdf.Root.get("/AcroForm")
    if not isinstance(form, pikepdf.Dictionary):
        form = pdf.make_indirect(pikepdf.Dictionary(Fields=pikepdf.Array()))
        pdf.Root["/AcroForm"] = form
    if "/Fields" not in form:
        form["/Fields"] = pikepdf.Array()
    resources = form.get("/DR")
    if not isinstance(resources, pikepdf.Dictionary):
        resources = pikepdf.Dictionary()
        form["/DR"] = resources
    fonts = resources.get("/Font")
    if not isinstance(fonts, pikepdf.Dictionary):
        fonts = pikepdf.Dictionary()
        resources["/Font"] = fonts
    if "/Helv" not in fonts:
        fonts["/Helv"] = pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.Font,
                Subtype=pikepdf.Name.Type1,
                BaseFont=pikepdf.Name.Helvetica,
                Encoding=pikepdf.Name.WinAnsiEncoding,
            )
        )
    if "/ZaDb" not in fonts:
        fonts["/ZaDb"] = pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.ZapfDingbats
            )
        )
    if "/DA" not in form:
        form["/DA"] = pikepdf.String("/Helv 0 Tf 0 g")
    form["/NeedAppearances"] = True
    return form


def existing_names(pdf: pikepdf.Pdf) -> set[str]:
    names: set[str] = set()
    form = pdf.Root.get("/AcroForm")
    if not isinstance(form, pikepdf.Dictionary):
        return names

    def walk(field: pikepdf.Object, prefix: str, depth: int) -> None:
        if depth > 32:
            return
        title = str(field.get("/T", ""))
        full = f"{prefix}.{title}" if prefix and title else title or prefix
        kids = field.get("/Kids")
        if full:
            names.add(full)
        if isinstance(kids, pikepdf.Array):
            for kid in kids:
                walk(kid, full, depth + 1)

    for field in form.get("/Fields", []):
        walk(field, "", 0)
    return names


def box_stream(
    pdf: pikepdf.Pdf, width: float, height: float, content: str, zapf: bool = False
) -> pikepdf.Object:
    stream = pdf.make_stream(content.encode("ascii"))
    stream["/Type"] = pikepdf.Name.XObject
    stream["/Subtype"] = pikepdf.Name.Form
    stream["/BBox"] = pikepdf.Array([0, 0, width, height])
    if zapf:
        stream["/Resources"] = pikepdf.Dictionary(
            Font=pikepdf.Dictionary(
                ZaDb=pdf.make_indirect(
                    pikepdf.Dictionary(
                        Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.ZapfDingbats
                    )
                )
            )
        )
    return pdf.make_indirect(stream)


def checkbox_appearance(pdf: pikepdf.Pdf, width: float, height: float) -> pikepdf.Dictionary:
    inner_w, inner_h = width - 1, height - 1
    frame = (
        f"0.96 0.97 1 rg 0 0 {width:.2f} {height:.2f} re f "
        f"0.35 G 1 w 0.5 0.5 {inner_w:.2f} {inner_h:.2f} re S"
    )
    size = min(width, height) * 0.8
    offset_x, offset_y = (width - size * 0.8) / 2, (height - size * 0.7) / 2
    mark = f"BT /ZaDb {size:.2f} Tf 0 g {offset_x:.2f} {offset_y:.2f} Td (4) Tj ET"
    return pikepdf.Dictionary(
        N=pikepdf.Dictionary(
            Yes=box_stream(pdf, width, height, f"q {frame} {mark} Q", zapf=True),
            Off=box_stream(pdf, width, height, f"q {frame} Q"),
        )
    )


def radio_appearance(pdf: pikepdf.Pdf, width: float, height: float, value: str) -> pikepdf.Dictionary:
    radius = min(width, height) / 2 - 0.5
    cx, cy = width / 2, height / 2
    k = 0.5522847498 * radius

    def circle(r: float, kappa: float) -> str:
        return (
            f"{cx + r:.2f} {cy:.2f} m "
            f"{cx + r:.2f} {cy + kappa:.2f} {cx + kappa:.2f} {cy + r:.2f} {cx:.2f} {cy + r:.2f} c "
            f"{cx - kappa:.2f} {cy + r:.2f} {cx - r:.2f} {cy + kappa:.2f} {cx - r:.2f} {cy:.2f} c "
            f"{cx - r:.2f} {cy - kappa:.2f} {cx - kappa:.2f} {cy - r:.2f} {cx:.2f} {cy - r:.2f} c "
            f"{cx + kappa:.2f} {cy - r:.2f} {cx + r:.2f} {cy - kappa:.2f} {cx + r:.2f} {cy:.2f} c h"
        )

    outer = f"0.96 0.97 1 rg 0.35 G 1 w {circle(radius, k)} B"
    dot = f"0 g {circle(radius * 0.5, k * 0.5)} f"
    states = {
        f"/{value}": box_stream(pdf, width, height, f"q {outer} {dot} Q"),
        "/Off": box_stream(pdf, width, height, f"q {outer} Q"),
    }
    return pikepdf.Dictionary(N=pikepdf.Dictionary(states))


def frame_appearance(pdf: pikepdf.Pdf, width: float, height: float) -> pikepdf.Dictionary:
    content = (
        f"q 0.96 0.97 1 rg 0 0 {width:.2f} {height:.2f} re f "
        f"0.35 G 1 w 0.5 0.5 {width - 1:.2f} {height - 1:.2f} re S Q"
    )
    return pikepdf.Dictionary(N=box_stream(pdf, width, height, content))


def common_flags(spec: FormFieldSpec) -> int:
    flags = 0
    if spec.required:
        flags |= FLAG_REQUIRED
    if spec.read_only:
        flags |= FLAG_READONLY
    return flags


def base_widget(spec: FormFieldSpec, page: pikepdf.Page, rect: list[float]) -> dict[str, object]:
    widget: dict[str, object] = {
        "/Type": pikepdf.Name.Annot,
        "/Subtype": pikepdf.Name.Widget,
        "/Rect": pikepdf.Array(rect),
        "/F": PRINT_FLAG,
        "/P": page.obj,
    }
    return widget


def add_field(
    pdf: pikepdf.Pdf,
    form: pikepdf.Dictionary,
    spec: FormFieldSpec,
    page: pikepdf.Page,
    geometry: PageGeometry,
) -> None:
    rect = user_rect(geometry, spec.x, spec.y, spec.width, spec.height)
    width, height = rect[2] - rect[0], rect[3] - rect[1]
    widget = base_widget(spec, page, rect)
    border = pikepdf.Dictionary(W=1, S=pikepdf.Name.S)
    style = pikepdf.Dictionary(BC=pikepdf.Array([0.35, 0.35, 0.35]), BG=pikepdf.Array([0.96, 0.97, 1]))
    if spec.tooltip:
        widget["/TU"] = pikepdf.String(spec.tooltip)
    if spec.kind in {"text", "multiline"}:
        size = spec.font_size or (12 if spec.kind == "multiline" else 0)
        widget.update(
            {
                "/FT": pikepdf.Name.Tx,
                "/T": pikepdf.String(spec.name),
                "/DA": pikepdf.String(f"/Helv {size:g} Tf 0 g"),
                "/Ff": common_flags(spec) | (FLAG_MULTILINE if spec.kind == "multiline" else 0),
                "/MK": style,
                "/BS": border,
                "/AP": frame_appearance(pdf, width, height),
            }
        )
        if spec.value:
            widget["/V"] = pikepdf.String(spec.value)
        if spec.max_length:
            widget["/MaxLen"] = spec.max_length
        annotation = pdf.make_indirect(pikepdf.Dictionary(widget))
        field = annotation
    elif spec.kind == "dropdown":
        if not spec.choices:
            raise ToolInputError(f"The drop-down “{spec.name}” needs at least one choice.")
        widget.update(
            {
                "/FT": pikepdf.Name.Ch,
                "/T": pikepdf.String(spec.name),
                "/DA": pikepdf.String(f"/Helv {spec.font_size or 0:g} Tf 0 g"),
                "/Ff": common_flags(spec) | FLAG_COMBO,
                "/Opt": pikepdf.Array([pikepdf.String(choice) for choice in spec.choices]),
                "/MK": style,
                "/BS": border,
                "/AP": frame_appearance(pdf, width, height),
            }
        )
        if spec.value:
            widget["/V"] = pikepdf.String(spec.value)
        annotation = pdf.make_indirect(pikepdf.Dictionary(widget))
        field = annotation
    elif spec.kind == "signature":
        widget.update(
            {
                "/FT": pikepdf.Name.Sig,
                "/T": pikepdf.String(spec.name),
                "/MK": style,
                "/BS": border,
                "/AP": frame_appearance(pdf, width, height),
            }
        )
        annotation = pdf.make_indirect(pikepdf.Dictionary(widget))
        field = annotation
    elif spec.kind == "checkbox":
        export = pikepdf.Name("/" + re.sub(r"[^A-Za-z0-9_]", "", spec.export_value or "Yes") or "/Yes")
        appearance = checkbox_appearance(pdf, width, height)
        widget.update(
            {
                "/FT": pikepdf.Name.Btn,
                "/T": pikepdf.String(spec.name),
                "/Ff": common_flags(spec),
                "/AP": appearance,
                "/AS": pikepdf.Name.Off,
                "/V": pikepdf.Name.Off,
                "/MK": pikepdf.Dictionary(CA=pikepdf.String("4")),
            }
        )
        if str(export) != "/Yes":
            normal = appearance["/N"]
            normal[str(export)] = normal["/Yes"]
            del normal["/Yes"]
        annotation = pdf.make_indirect(pikepdf.Dictionary(widget))
        field = annotation
    else:
        value = re.sub(r"[^A-Za-z0-9_]", "", spec.export_value or "Choice") or "Choice"
        group_name = spec.name
        group = find_radio_group(form, group_name)
        if group is None:
            group = pdf.make_indirect(
                pikepdf.Dictionary(
                    FT=pikepdf.Name.Btn,
                    T=pikepdf.String(group_name),
                    Ff=common_flags(spec) | FLAG_RADIO | FLAG_NO_TOGGLE_OFF,
                    Kids=pikepdf.Array(),
                    V=pikepdf.Name.Off,
                )
            )
            form["/Fields"].append(group)
        widget.update(
            {
                "/Parent": group,
                "/AP": radio_appearance(pdf, width, height, value),
                "/AS": pikepdf.Name.Off,
                "/MK": pikepdf.Dictionary(CA=pikepdf.String("l")),
            }
        )
        annotation = pdf.make_indirect(pikepdf.Dictionary(widget))
        group["/Kids"].append(annotation)
        field = None
    annots = page.obj.get("/Annots")
    if not isinstance(annots, pikepdf.Array):
        annots = pikepdf.Array()
        page.obj["/Annots"] = annots
    annots.append(annotation)
    if field is not None:
        form["/Fields"].append(field)


def find_radio_group(form: pikepdf.Dictionary, name: str) -> pikepdf.Object | None:
    for field in form.get("/Fields", []):
        if str(field.get("/T", "")) == name and "/Kids" in field:
            return field
    return None


def apply_fields(pdf: pikepdf.Pdf, specs: Sequence[FormFieldSpec]) -> None:
    taken = existing_names(pdf)
    seen_singletons: set[str] = set()
    form = ensure_acroform(pdf)
    for spec in specs:
        if spec.page > len(pdf.pages):
            raise ToolInputError(f"Page {spec.page} does not exist in this document.")
        if spec.kind != "radio":
            if spec.name in taken or spec.name in seen_singletons:
                raise ToolInputError(f"The field name “{spec.name}” is used more than once.")
            seen_singletons.add(spec.name)
        elif spec.name in taken and find_radio_group(form, spec.name) is None:
            raise ToolInputError(f"The field name “{spec.name}” is already used by another field.")
        page = pdf.pages[spec.page - 1]
        add_field(pdf, form, spec, page, page_geometry(page))
    pdf.generate_appearance_streams()


class CreateFormTool(Tool[CreateFormOptions]):
    slug = "create-form"
    name = "Create fillable form"
    category = ToolCategory.EDIT
    summary = "Add text boxes, check boxes, radio buttons, drop-downs and signature fields to a PDF."
    input_spec = InputSpec(
        min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = CreateFormOptions
    seconds_per_page = 0.01

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: CreateFormOptions
    ) -> None:
        for info in files:
            if info.page_count is not None and any(spec.page > info.page_count for spec in options.fields):
                raise ToolInputError("A field points at a page that does not exist.")

    def run(self, ctx: JobContext[CreateFormOptions]) -> list[OutputFile]:
        item = ctx.inputs[0]
        with open_pdf(item) as pdf:
            apply_fields(pdf, ctx.options.fields)
            target = ctx.output_path(pdf_name(f"{item.stem}-form", "form"))
            save_pdf(pdf, target)
        return [output_pdf(target)]


MIN_LINE_WIDTH = 36.0
FIELD_HEIGHT = 16.0
CHECKBOX_RANGE = (6.0, 20.0)
BOX_MIN_WIDTH = 50.0
BOX_HEIGHT_RANGE = (11.0, 60.0)


class DetectFieldsOptions(ToolOptions):
    detect_lines: bool = True
    detect_boxes: bool = True
    detect_checkboxes: bool = True
    max_fields: int = Field(default=150, ge=1, le=MAX_FIELDS)


def overlap_ratio(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    left, top = max(a[0], b[0]), max(a[1], b[1])
    right, bottom = min(a[2], b[2]), min(a[3], b[3])
    if right <= left or bottom <= top:
        return 0.0
    inter = (right - left) * (bottom - top)
    return inter / min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))


def label_for(words: list[dict[str, float | str]], box: tuple[float, float, float, float]) -> str:
    centre = (box[1] + box[3]) / 2
    candidates = [
        word
        for word in words
        if float(word["x1"]) <= box[0] + 2
        and abs((float(word["top"]) + float(word["bottom"])) / 2 - centre) < FIELD_HEIGHT
        and box[0] - float(word["x1"]) < 220
    ]
    candidates.sort(key=lambda word: float(word["x0"]))
    tail = [str(word["text"]) for word in candidates[-4:]]
    label = re.sub(r"[^A-Za-z0-9]+", "_", " ".join(tail)).strip("_").lower()
    return label[:40]


def detect_on_page(
    page: pdfplumber.page.Page, options: DetectFieldsOptions
) -> list[tuple[str, tuple[float, float, float, float], str]]:
    words = page.extract_words()
    chars_box = [(float(w["x0"]), float(w["top"]), float(w["x1"]), float(w["bottom"])) for w in words]
    found: list[tuple[str, tuple[float, float, float, float], str]] = []
    if options.detect_lines:
        for match in page.search(r"_{3,}", regex=True):
            box = (
                float(match["x0"]),
                float(match["bottom"]) - FIELD_HEIGHT,
                float(match["x1"]),
                float(match["bottom"]),
            )
            found.append(("text", box, label_for(words, box)))
        horizontals = [line for line in page.lines if abs(float(line["top"]) - float(line["bottom"])) < 1.5]
        horizontals += [rect for rect in page.rects if float(rect["height"]) < 1.5]
        for line in horizontals:
            width = float(line["x1"]) - float(line["x0"])
            if width < MIN_LINE_WIDTH or width > page.width * 0.95:
                continue
            bottom = float(line["top"])
            box = (float(line["x0"]), bottom - FIELD_HEIGHT, float(line["x1"]), bottom)
            if any(overlap_ratio(box, text) > 0.15 for text in chars_box):
                continue
            found.append(("text", box, label_for(words, box)))
    for rect in page.rects:
        width, height = float(rect["width"]), float(rect["height"])
        box = (float(rect["x0"]), float(rect["top"]), float(rect["x1"]), float(rect["bottom"]))
        if (
            options.detect_checkboxes
            and CHECKBOX_RANGE[0] <= width <= CHECKBOX_RANGE[1]
            and abs(width - height) < 2.5
        ):
            if not any(overlap_ratio(box, text) > 0.3 for text in chars_box):
                found.append(
                    ("checkbox", box, label_for(words, (box[0] - 0.0, box[1], box[0], box[3])) or "")
                )
            continue
        if (
            options.detect_boxes
            and width >= BOX_MIN_WIDTH
            and BOX_HEIGHT_RANGE[0] <= height <= BOX_HEIGHT_RANGE[1]
            and width < page.width * 0.95
            and not any(overlap_ratio(text, box) > 0.1 for text in chars_box)
        ):
            found.append(("text", box, label_for(words, box)))
    unique: list[tuple[str, tuple[float, float, float, float], str]] = []
    for entry in found:
        if all(overlap_ratio(entry[1], other[1]) < 0.6 for other in unique):
            unique.append(entry)
    unique.sort(key=lambda entry: (round(entry[1][1] / 6), entry[1][0]))
    return unique


class DetectFormFieldsTool(Tool[DetectFieldsOptions]):
    slug = "detect-form-fields"
    name = "Auto-detect form fields"
    category = ToolCategory.EDIT
    summary = "Find blanks, ruled lines and boxes in a flat PDF and turn them into fillable fields."
    input_spec = InputSpec(
        min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = DetectFieldsOptions
    seconds_per_page = 0.15

    def run(self, ctx: JobContext[DetectFieldsOptions]) -> list[OutputFile]:
        item = ctx.inputs[0]
        options = ctx.options
        specs: list[FormFieldSpec] = []
        used: set[str] = set()
        with open_pdf(item) as pdf, pdfplumber.open(item.path) as plumber:
            existing = existing_names(pdf)
            for index, plumber_page in enumerate(plumber.pages):
                ctx.ensure_not_cancelled()
                ctx.report(index / len(plumber.pages) * 0.8, f"Scanning page {index + 1}")
                geometry = page_geometry(pdf.pages[index])
                if geometry.rotation:
                    continue
                for kind, box, label in detect_on_page(plumber_page, options):
                    if len(specs) >= options.max_fields:
                        break
                    base = label or ("checkbox" if kind == "checkbox" else "field")
                    base = base if re.match(r"^[A-Za-z]", base) else f"f_{base}"
                    name, counter = base, 1
                    while name in used or name in existing:
                        counter += 1
                        name = f"{base}_{counter}"
                    used.add(name)
                    left, top, right, bottom = box
                    specs.append(
                        FormFieldSpec(
                            kind="checkbox" if kind == "checkbox" else "text",
                            name=name,
                            page=index + 1,
                            x=max(left, 0) / geometry.width * 100,
                            y=max(top, 0) / geometry.height * 100,
                            width=max((right - left) / geometry.width * 100, 0.5),
                            height=max((bottom - top) / geometry.height * 100, 0.5),
                        )
                    )
            if not specs:
                raise ToolFailedError(
                    "No blanks, lines or boxes were found to turn into fields.", code="nothing_found"
                )
            apply_fields(pdf, specs)
            target = ctx.output_path(pdf_name(f"{item.stem}-fillable", "fillable"))
            save_pdf(pdf, target)
        return [output_pdf(target)]
