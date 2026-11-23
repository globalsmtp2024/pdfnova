import string
from collections.abc import Sequence
from typing import Literal

import pikepdf
from pydantic import Field, field_validator

from app.core.errors import ToolInputError
from app.text.bidi import Direction
from app.text.fonts import FontKey
from app.text.geometry import Anchor, anchor_center, mirrored, page_geometry, stamp_matrix
from app.text.overlay import OverlayDocument, TextStyle, parse_hex_color
from app.tools.base import InputFile, InputFileInfo, JobContext, OutputFile, Tool, ToolCategory, ToolOptions
from app.tools.edit.stamping import (
    NOTHING_HINT,
    NOTHING_SELECTED,
    POINTS_PER_MM,
    STAMP_SPEC,
    Parity,
    check_expression,
    checked_color,
    select_pages,
    stamp_each,
)

LabelFormat = Literal["n", "page_n", "n_of_total", "page_n_of_total", "custom"]
NumberStyle = Literal["decimal", "roman_lower", "roman_upper", "letters_lower", "letters_upper"]
Digits = Literal["western", "arabic_indic", "extended_arabic_indic"]
TEMPLATES: dict[str, str] = {
    "n": "{n}",
    "page_n": "Page {n}",
    "n_of_total": "{n} / {total}",
    "page_n_of_total": "Page {n} of {total}",
}
_ROMAN = (
    (1000, "M"),
    (900, "CM"),
    (500, "D"),
    (400, "CD"),
    (100, "C"),
    (90, "XC"),
    (50, "L"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
)
_DIGIT_BASE = {"arabic_indic": 0x0660, "extended_arabic_indic": 0x06F0}


def to_roman(value: int) -> str:
    if value < 1 or value > 3999:
        return str(value)
    parts: list[str] = []
    for amount, symbol in _ROMAN:
        count, value = divmod(value, amount)
        parts.append(symbol * count)
    return "".join(parts)


def to_letters(value: int) -> str:
    if value < 1:
        return str(value)
    letters: list[str] = []
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        letters.append(chr(ord("A") + remainder))
    return "".join(reversed(letters))


def format_number(value: int, style: NumberStyle, digits: Digits) -> str:
    if style == "roman_upper":
        return to_roman(value)
    if style == "roman_lower":
        return to_roman(value).lower()
    if style == "letters_upper":
        return to_letters(value)
    if style == "letters_lower":
        return to_letters(value).lower()
    text = str(value)
    if digits in _DIGIT_BASE:
        base = _DIGIT_BASE[digits]
        text = "".join(chr(base + int(char)) if char.isdigit() else char for char in text)
    return text


class PageNumbersOptions(ToolOptions):
    position: Anchor = "bottom-center"
    margin_x: float = Field(default=36, ge=0, le=2000)
    margin_y: float = Field(default=28, ge=0, le=2000)
    unit: Literal["pt", "mm"] = "pt"
    mirror: bool = False
    start_number: int = Field(default=1, ge=0, le=1_000_000)
    first_page: int = Field(default=1, ge=1, le=1_000_000)
    skip_first: int = Field(default=0, ge=0, le=1_000_000)
    skip_last: int = Field(default=0, ge=0, le=1_000_000)
    pages: str | None = Field(default=None, max_length=2000)
    parity: Parity = "all"
    format: LabelFormat = "n"
    template: str = Field(default="{n}", max_length=200)
    style: NumberStyle = "decimal"
    digits: Digits = "western"
    direction: Direction = "auto"
    font: FontKey = "noto-sans"
    size: float = Field(default=11, ge=4, le=200)
    color: str = Field(default="#000000", max_length=9)
    opacity: float = Field(default=1.0, ge=0.05, le=1.0)
    bold: bool = False

    @field_validator("template")
    @classmethod
    def _template_fields(cls, value: str) -> str:
        try:
            fields = {name for _, name, _, _ in string.Formatter().parse(value) if name is not None}
        except ValueError as exc:
            raise ValueError("The label template has unbalanced braces.") from exc
        if not fields <= {"n", "total"}:
            raise ValueError("Use only {n} and {total} in the label template.")
        if "n" not in fields:
            raise ValueError("The label template needs {n} for the page number.")
        return value

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        return checked_color(value)

    def label_template(self) -> str:
        return self.template if self.format == "custom" else TEMPLATES[self.format]

    def label(self, number: int, total: int) -> str:
        return self.label_template().format(
            n=format_number(number, self.style, self.digits),
            total=format_number(total, self.style, self.digits),
        )

    def margins_pt(self) -> tuple[float, float]:
        factor = POINTS_PER_MM if self.unit == "mm" else 1.0
        return (self.margin_x * factor, self.margin_y * factor)


def numbered_pages(options: PageNumbersOptions, count: int) -> list[tuple[int, int, int]]:
    chosen = select_pages(
        count, options.pages, options.parity, options.first_page, options.skip_first, options.skip_last
    )
    if not chosen:
        return []
    first = chosen[0]
    total = options.start_number + (chosen[-1] - first)
    return [(index, options.start_number + (index - first), total) for index in chosen]


def apply_page_numbers(pdf: pikepdf.Pdf, overlay: OverlayDocument, options: PageNumbersOptions) -> int:
    style = TextStyle(
        font=options.font,
        size=options.size,
        color=parse_hex_color(options.color),
        opacity=options.opacity,
        bold=options.bold,
        direction=options.direction,
    )
    margin_x, margin_y = options.margins_pt()
    plan = numbered_pages(options, len(pdf.pages))
    for index, number, total in plan:
        page = pdf.pages[index]
        stamp = overlay.text_stamp(options.label(number, total), style)
        geometry = page_geometry(page)
        anchor = mirrored(options.position) if options.mirror and index % 2 == 1 else options.position
        center = anchor_center(
            anchor,
            geometry.visual_width,
            geometry.visual_height,
            stamp.width,
            stamp.height,
            margin_x,
            margin_y,
        )
        overlay.place(page, stamp, stamp_matrix(geometry, center, stamp.width, stamp.height, 0.0))
    return len(plan)


class PageNumbersTool(Tool[PageNumbersOptions]):
    slug = "page-numbers"
    name = "Add page numbers"
    category = ToolCategory.EDIT
    summary = "Number pages with your position, format, font and language, including Urdu labels."
    input_spec = STAMP_SPEC
    options_schema = PageNumbersOptions
    seconds_per_page = 0.004

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: PageNumbersOptions
    ) -> None:
        check_expression(files, options.pages)
        for info in files:
            if info.page_count is not None and not numbered_pages(options, info.page_count):
                raise ToolInputError(NOTHING_SELECTED, hint=NOTHING_HINT)

    def run(self, ctx: JobContext[PageNumbersOptions]) -> list[OutputFile]:
        options = ctx.options

        def stamper(pdf: pikepdf.Pdf, overlay: OverlayDocument, _: InputFile) -> int:
            return apply_page_numbers(pdf, overlay, options)

        return stamp_each(ctx, stamper, "numbered", "Numbering file")
