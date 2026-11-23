import io
import math
from collections.abc import Sequence
from pathlib import Path
from typing import Annotated, Literal

import pikepdf
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.text.fonts import FontKey
from app.text.geometry import Matrix, PageGeometry, page_geometry, stamp_matrix
from app.text.images import check_image, decode_image_data, prepare_image
from app.text.overlay import OverlayDocument, TextStyle, parse_hex_color
from app.tools.base import (
    InputFileInfo,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolOptions,
)
from app.tools.edit.editor_text import Replacement, find_matches, remove_text_objects
from app.tools.pages import parse_page_ranges
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

MAX_OPERATIONS = 2000
MAX_POINTS = 4000
SAFE_LINK_PREFIXES = ("http://", "https://", "mailto:", "tel:")
Percent = Annotated[float, Field(ge=0, le=100)]
HexColor = Annotated[str, Field(min_length=7, max_length=7)]


class Operation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(ge=1, le=100000)

    @field_validator("*", mode="after")
    @classmethod
    def _colors(cls, value: object, info: object) -> object:
        name = getattr(info, "field_name", "")
        if isinstance(value, str) and name in {"color", "fill", "stroke"} and value:
            parse_hex_color(value)
        return value


class TextOp(Operation):
    type: Literal["text"]
    x: Percent
    y: Percent
    text: str = Field(min_length=1, max_length=5000)
    font: FontKey = "noto-sans"
    size: float = Field(default=14.0, ge=4, le=300)
    color: str = "#000000"
    bold: bool = False
    align: Literal["left", "center", "right"] = "left"
    opacity: float = Field(default=1.0, ge=0.05, le=1)
    rotation: float = Field(default=0.0, ge=-360, le=360)


class ImageOp(Operation):
    type: Literal["image"]
    x: Percent
    y: Percent
    width: float = Field(ge=0.5, le=100)
    height: float = Field(ge=0.5, le=100)
    image_data: str = Field(max_length=14_000_000)
    opacity: float = Field(default=1.0, ge=0.05, le=1)
    rotation: float = Field(default=0.0, ge=-360, le=360)


class ShapeOp(Operation):
    type: Literal["rectangle", "ellipse"]
    x: Percent
    y: Percent
    width: float = Field(ge=0.1, le=100)
    height: float = Field(ge=0.1, le=100)
    stroke: str = "#000000"
    fill: str = ""
    stroke_width: float = Field(default=2.0, ge=0, le=40)
    opacity: float = Field(default=1.0, ge=0.05, le=1)


class LineOp(Operation):
    type: Literal["line"]
    x1: Percent
    y1: Percent
    x2: Percent
    y2: Percent
    color: str = "#000000"
    stroke_width: float = Field(default=2.0, ge=0.25, le=40)
    arrow: bool = False
    opacity: float = Field(default=1.0, ge=0.05, le=1)


class HighlightOp(Operation):
    type: Literal["highlight"]
    x: Percent
    y: Percent
    width: float = Field(ge=0.1, le=100)
    height: float = Field(ge=0.1, le=100)
    color: str = "#FFEB3B"
    opacity: float = Field(default=0.45, ge=0.05, le=1)


class DrawOp(Operation):
    type: Literal["draw"]
    points: list[tuple[Percent, Percent]] = Field(min_length=2, max_length=MAX_POINTS)
    color: str = "#E53935"
    stroke_width: float = Field(default=2.5, ge=0.25, le=40)
    opacity: float = Field(default=1.0, ge=0.05, le=1)


class NoteOp(Operation):
    type: Literal["note"]
    x: Percent
    y: Percent
    text: str = Field(min_length=1, max_length=2000)
    color: str = "#FFEB3B"


class LinkOp(Operation):
    type: Literal["link"]
    x: Percent
    y: Percent
    width: float = Field(ge=0.5, le=100)
    height: float = Field(ge=0.5, le=100)
    url: str = Field(min_length=3, max_length=2000)

    @field_validator("url")
    @classmethod
    def _safe_url(cls, value: str) -> str:
        if not value.lower().startswith(SAFE_LINK_PREFIXES):
            raise ValueError("Links must start with http://, https://, mailto: or tel:")
        return value


class ReplaceTextOp(Operation):
    type: Literal["replace_text"]
    x: Percent
    y: Percent
    width: float = Field(ge=0.2, le=100)
    height: float = Field(ge=0.2, le=100)
    text: str = Field(max_length=5000)
    font: FontKey = "noto-sans"
    size: float = Field(default=12.0, ge=4, le=300)
    color: str = "#000000"
    bold: bool = False
    background: str = "#FFFFFF"


class FindReplaceOp(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["find_replace"]
    find: str = Field(min_length=1, max_length=200)
    replace: str = Field(max_length=500)
    match_case: bool = False
    pages: str = Field(default="all", max_length=500)
    font: FontKey = "noto-sans"
    color: str = "#000000"
    bold: bool = False
    background: str = "#FFFFFF"

    @field_validator("color", "background")
    @classmethod
    def _hex(cls, value: str) -> str:
        parse_hex_color(value)
        return value


AnyOperation = Annotated[
    TextOp
    | ImageOp
    | ShapeOp
    | LineOp
    | HighlightOp
    | DrawOp
    | NoteOp
    | LinkOp
    | ReplaceTextOp
    | FindReplaceOp,
    Field(discriminator="type"),
]


class EditPdfOptions(ToolOptions):
    operations: list[AnyOperation] = Field(min_length=1, max_length=MAX_OPERATIONS)


def rgb(value: str) -> str:
    red, green, blue = parse_hex_color(value)
    return f"{red:.4f} {green:.4f} {blue:.4f}"


def number(value: float) -> str:
    return f"{value:.3f}"


def to_visual(geometry: PageGeometry, x: float, y: float) -> tuple[float, float]:
    return x / 100 * geometry.visual_width, geometry.visual_height - y / 100 * geometry.visual_height


def to_user(geometry: PageGeometry, point: tuple[float, float]) -> tuple[float, float]:
    a, b, c, d, e, f = geometry.visual_to_user()
    return a * point[0] + c * point[1] + e, b * point[0] + d * point[1] + f


def user_rect(geometry: PageGeometry, left: float, top: float, width: float, height: float) -> list[float]:
    first = to_user(geometry, to_visual(geometry, left, top))
    second = to_user(geometry, to_visual(geometry, left + width, top + height))
    return [
        min(first[0], second[0]),
        min(first[1], second[1]),
        max(first[0], second[0]),
        max(first[1], second[1]),
    ]


def place_stamp(
    overlay: OverlayDocument,
    page: pikepdf.Page,
    geometry: PageGeometry,
    stamp_width: float,
    stamp_height: float,
    stamp: object,
    top_left: tuple[float, float],
    rotation: float,
) -> None:
    center = (top_left[0] + stamp_width / 2, top_left[1] - stamp_height / 2)
    matrix: Matrix = stamp_matrix(geometry, center, stamp_width, stamp_height, rotation)
    overlay.place(page, stamp, matrix)  # type: ignore[arg-type]


def apply_text(overlay: OverlayDocument, page: pikepdf.Page, geometry: PageGeometry, op: TextOp) -> None:
    style = TextStyle(
        font=op.font,
        size=op.size,
        color=parse_hex_color(op.color),
        opacity=op.opacity,
        bold=op.bold,
        align=op.align,
    )
    stamp = overlay.text_stamp(op.text, style)
    place_stamp(
        overlay,
        page,
        geometry,
        stamp.width,
        stamp.height,
        stamp,
        to_visual(geometry, op.x, op.y),
        op.rotation,
    )


def apply_image(overlay: OverlayDocument, page: pikepdf.Page, geometry: PageGeometry, op: ImageOp) -> None:
    raw = decode_image_data(op.image_data)
    check_image(raw)
    width = op.width / 100 * geometry.visual_width
    height = op.height / 100 * geometry.visual_height
    stamp = overlay.image_stamp(prepare_image(raw), width, height, op.opacity)
    place_stamp(overlay, page, geometry, width, height, stamp, to_visual(geometry, op.x, op.y), op.rotation)


def apply_shape(overlay: OverlayDocument, page: pikepdf.Page, geometry: PageGeometry, op: ShapeOp) -> None:
    width = op.width / 100 * geometry.visual_width
    height = op.height / 100 * geometry.visual_height
    pad = op.stroke_width
    box_w, box_h = width + 2 * pad, height + 2 * pad
    commands = [f"{number(op.stroke_width)} w", f"{rgb(op.stroke)} RG"]
    if op.fill:
        commands.append(f"{rgb(op.fill)} rg")
    paint = ("B" if op.fill else "S") if op.stroke_width > 0 else ("f" if op.fill else "n")
    if op.type == "rectangle":
        commands.append(f"{number(pad)} {number(pad)} {number(width)} {number(height)} re {paint}")
    else:
        kappa = 0.5522847498
        cx, cy, rx, ry = pad + width / 2, pad + height / 2, width / 2, height / 2
        commands.extend(_ellipse_path(cx, cy, rx, ry, kappa))
        commands.append(paint)
    stamp = overlay.vector_stamp("\n".join(c for c in commands if c), box_w, box_h, op.opacity)
    left, top = to_visual(geometry, op.x, op.y)
    place_stamp(overlay, page, geometry, box_w, box_h, stamp, (left - pad, top + pad), 0.0)


def _ellipse_path(cx: float, cy: float, rx: float, ry: float, kappa: float) -> list[str]:
    points = [
        (cx + rx, cy + ry * kappa, cx + rx * kappa, cy + ry, cx, cy + ry),
        (cx - rx * kappa, cy + ry, cx - rx, cy + ry * kappa, cx - rx, cy),
        (cx - rx, cy - ry * kappa, cx - rx * kappa, cy - ry, cx, cy - ry),
        (cx + rx * kappa, cy - ry, cx + rx, cy - ry * kappa, cx + rx, cy),
    ]
    lines = [f"{number(cx + rx)} {number(cy)} m"]
    for values in points:
        lines.append(" ".join(number(value) for value in values) + " c")
    lines.append("h")
    return lines


def stroke_stamp(
    overlay: OverlayDocument,
    page: pikepdf.Page,
    geometry: PageGeometry,
    points: Sequence[tuple[float, float]],
    color: str,
    stroke_width: float,
    opacity: float,
    arrow: bool = False,
) -> None:
    visual = [to_visual(geometry, x, y) for x, y in points]
    pad = stroke_width + (stroke_width * 6 if arrow else 0)
    left = min(x for x, _ in visual) - pad
    bottom = min(y for _, y in visual) - pad
    right = max(x for x, _ in visual) + pad
    top = max(y for _, y in visual) + pad
    local = [(x - left, y - bottom) for x, y in visual]
    commands = [
        f"{number(stroke_width)} w",
        "1 J 1 j",
        f"{rgb(color)} RG",
        f"{rgb(color)} rg",
        f"{number(local[0][0])} {number(local[0][1])} m",
    ]
    commands.extend(f"{number(x)} {number(y)} l" for x, y in local[1:])
    commands.append("S")
    if arrow and len(local) >= 2:
        (x0, y0), (x1, y1) = local[-2], local[-1]
        angle = math.atan2(y1 - y0, x1 - x0)
        size = stroke_width * 5
        wing_a = (x1 - size * math.cos(angle - 0.45), y1 - size * math.sin(angle - 0.45))
        wing_b = (x1 - size * math.cos(angle + 0.45), y1 - size * math.sin(angle + 0.45))
        commands.append(
            f"{number(x1)} {number(y1)} m {number(wing_a[0])} {number(wing_a[1])} l "
            f"{number(wing_b[0])} {number(wing_b[1])} l h f"
        )
    stamp = overlay.vector_stamp("\n".join(commands), right - left, top - bottom, opacity)
    place_stamp(overlay, page, geometry, right - left, top - bottom, stamp, (left, top), 0.0)


def apply_highlight(
    overlay: OverlayDocument, page: pikepdf.Page, geometry: PageGeometry, op: HighlightOp
) -> None:
    width = op.width / 100 * geometry.visual_width
    height = op.height / 100 * geometry.visual_height
    content = f"{rgb(op.color)} rg\n0 0 {number(width)} {number(height)} re f"
    stamp = overlay.vector_stamp(content, width, height, op.opacity, blend="Multiply")
    place_stamp(overlay, page, geometry, width, height, stamp, to_visual(geometry, op.x, op.y), 0.0)


def add_annotation(page: pikepdf.Page, annotation: pikepdf.Dictionary) -> None:
    annotations = page.obj.get("/Annots")
    if not isinstance(annotations, pikepdf.Array):
        annotations = pikepdf.Array()
        page.obj["/Annots"] = annotations
    annotations.append(annotation)


def apply_note(pdf: pikepdf.Pdf, page: pikepdf.Page, geometry: PageGeometry, op: NoteOp) -> None:
    rect = user_rect(geometry, op.x, op.y, 3.0, 3.0)
    red, green, blue = parse_hex_color(op.color)
    add_annotation(
        page,
        pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.Annot,
                Subtype=pikepdf.Name.Text,
                Rect=pikepdf.Array(rect),
                Contents=pikepdf.String(op.text),
                Name=pikepdf.Name.Comment,
                C=pikepdf.Array([red, green, blue]),
                F=4,
                Open=False,
            )
        ),
    )


def apply_link(pdf: pikepdf.Pdf, page: pikepdf.Page, geometry: PageGeometry, op: LinkOp) -> None:
    rect = user_rect(geometry, op.x, op.y, op.width, op.height)
    add_annotation(
        page,
        pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.Annot,
                Subtype=pikepdf.Name.Link,
                Rect=pikepdf.Array(rect),
                Border=pikepdf.Array([0, 0, 0]),
                F=4,
                A=pikepdf.Dictionary(S=pikepdf.Name.URI, URI=pikepdf.String(op.url)),
            )
        ),
    )


def collect_replacements(
    path: Path, geometries: list[PageGeometry], operations: Sequence[AnyOperation]
) -> list[Replacement]:
    replacements: list[Replacement] = []
    for operation in operations:
        if isinstance(operation, ReplaceTextOp):
            geometry = geometries[operation.page - 1]
            left, top = to_visual(geometry, operation.x, operation.y)
            right, bottom = to_visual(geometry, operation.x + operation.width, operation.y + operation.height)
            replacements.append(
                Replacement(
                    operation.page - 1,
                    left,
                    bottom,
                    right,
                    top,
                    operation.text,
                    operation.font,
                    operation.size,
                    operation.color,
                    operation.bold,
                    operation.background,
                )
            )
        elif isinstance(operation, FindReplaceOp):
            indices = (
                list(range(len(geometries)))
                if operation.pages.strip().lower() == "all"
                else parse_page_ranges(operation.pages, len(geometries))
            )
            replacements.extend(
                find_matches(
                    path,
                    geometries,
                    indices,
                    operation.find,
                    operation.replace,
                    operation.match_case,
                    (operation.font, operation.color, operation.bold, operation.background),
                )
            )
    if len(replacements) > MAX_OPERATIONS:
        raise ToolInputError("That would change too many places at once.")
    return replacements


def apply_replacements(
    pdf: pikepdf.Pdf, geometries: list[PageGeometry], replacements: list[Replacement]
) -> None:
    overlay = OverlayDocument(pdf, prefix="Rp")
    for replacement in replacements:
        page = pdf.pages[replacement.page_index]
        geometry = geometries[replacement.page_index]
        pad = 1.0
        width = replacement.right - replacement.left + 2 * pad
        height = replacement.top - replacement.bottom + 2 * pad
        cover = overlay.vector_stamp(
            f"{rgb(replacement.background)} rg\n0 0 {number(width)} {number(height)} re f", width, height, 1.0
        )
        place_stamp(
            overlay,
            page,
            geometry,
            width,
            height,
            cover,
            (replacement.left - pad, replacement.top + pad),
            0.0,
        )
        if not replacement.text:
            continue
        style = TextStyle(
            font=replacement.font,
            size=replacement.size,
            color=parse_hex_color(replacement.color),
            bold=replacement.bold,
            align="left",
        )
        stamp = overlay.text_stamp(replacement.text, style)
        middle = (replacement.top + replacement.bottom) / 2
        place_stamp(
            overlay,
            page,
            geometry,
            stamp.width,
            stamp.height,
            stamp,
            (replacement.left, middle + stamp.height / 2),
            0.0,
        )
    overlay.finalize()


def apply_operations(pdf: pikepdf.Pdf, operations: Sequence[AnyOperation]) -> None:
    overlay = OverlayDocument(pdf, prefix="Ed")
    for operation in operations:
        if isinstance(operation, FindReplaceOp):
            continue
        if operation.page > len(pdf.pages):
            raise ToolInputError(f"Page {operation.page} does not exist in this document.")
        page = pdf.pages[operation.page - 1]
        geometry = page_geometry(page)
        if isinstance(operation, TextOp):
            apply_text(overlay, page, geometry, operation)
        elif isinstance(operation, ImageOp):
            apply_image(overlay, page, geometry, operation)
        elif isinstance(operation, ShapeOp):
            apply_shape(overlay, page, geometry, operation)
        elif isinstance(operation, LineOp):
            stroke_stamp(
                overlay,
                page,
                geometry,
                [(operation.x1, operation.y1), (operation.x2, operation.y2)],
                operation.color,
                operation.stroke_width,
                operation.opacity,
                operation.arrow,
            )
        elif isinstance(operation, HighlightOp):
            apply_highlight(overlay, page, geometry, operation)
        elif isinstance(operation, DrawOp):
            stroke_stamp(
                overlay,
                page,
                geometry,
                operation.points,
                operation.color,
                operation.stroke_width,
                operation.opacity,
            )
        elif isinstance(operation, ReplaceTextOp):
            continue
        elif isinstance(operation, NoteOp):
            apply_note(pdf, page, geometry, operation)
        else:
            apply_link(pdf, page, geometry, operation)
    overlay.finalize()


class EditPdfTool(Tool[EditPdfOptions]):
    slug = "edit-pdf"
    name = "Edit PDF"
    category = ToolCategory.EDIT
    summary = "Add text, images, shapes, highlights, drawings, notes and links to a PDF."
    input_spec = InputSpec(
        min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = EditPdfOptions
    seconds_per_page = 0.01

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: EditPdfOptions
    ) -> None:
        for info in files:
            if info.page_count is None:
                continue
            for operation in options.operations:
                if not isinstance(operation, FindReplaceOp) and operation.page > info.page_count:
                    raise ToolInputError(f"Page {operation.page} does not exist in this document.")

    def run(self, ctx: JobContext[EditPdfOptions]) -> list[OutputFile]:
        item = ctx.inputs[0]
        operations = ctx.options.operations
        ctx.report(0.2, "Applying edits")
        with open_pdf(item) as source:
            geometries = [page_geometry(page) for page in source.pages]
            replacements = collect_replacements(item.path, geometries, operations)
            working = source
            if replacements:
                cleaned = remove_text_objects(item.path, geometries, replacements)
                working = pikepdf.open(io.BytesIO(cleaned))
            try:
                if replacements:
                    apply_replacements(working, geometries, replacements)
                apply_operations(working, operations)
                target = ctx.output_path(pdf_name(f"{item.stem}-edited", "edited"))
                ctx.report(0.9, "Saving")
                save_pdf(working, target)
            finally:
                if working is not source:
                    working.close()
        return [output_pdf(target)]
