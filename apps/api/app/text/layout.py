from dataclasses import dataclass

import pikepdf

from app.text.bidi import paragraph_is_rtl
from app.text.fonts import FontKey
from app.text.geometry import translate
from app.text.overlay import RGB, OverlayDocument, TextStyle
from app.text.shaping import shape_line

A4_SIZE = (595.0, 842.0)
LETTER_SIZE = (612.0, 792.0)
MAX_PAGES = 2000


@dataclass(frozen=True)
class Block:
    text: str
    size: float = 11.0
    bold: bool = False
    font: FontKey = "noto-sans"
    indent: float = 0.0
    space_before: float = 0.0
    space_after: float = 4.0
    color: RGB = (0.0, 0.0, 0.0)
    preserve: bool = False


def _width(text: str, block: Block) -> float:
    return shape_line(text, block.font, block.bold, block.size, "auto").width


def wrap_block(block: Block, max_width: float) -> list[str]:
    lines: list[str] = []
    for raw in block.text.split("\n"):
        if not raw.strip():
            lines.append("")
            continue
        if block.preserve:
            current = ""
            for char in raw.expandtabs(4):
                if current and _width(current + char, block) > max_width:
                    lines.append(current)
                    current = char
                else:
                    current += char
            lines.append(current)
            continue
        current = ""
        for word in raw.split():
            candidate = f"{current} {word}" if current else word
            if current and _width(candidate, block) > max_width:
                lines.append(current)
                current = word
            else:
                current = candidate
        if current:
            lines.append(current)
    return lines or [""]


def render_blocks(
    blocks: list[Block], page_size: tuple[float, float] = A4_SIZE, margin: float = 54.0
) -> pikepdf.Pdf:
    pdf = pikepdf.new()
    overlay = OverlayDocument(pdf, prefix="Lay")
    width, height = page_size
    usable = width - 2 * margin
    page = pdf.add_blank_page(page_size=page_size)
    cursor = height - margin
    for block in blocks:
        lines = wrap_block(block, usable - block.indent)
        leading = block.size * 1.3
        cursor -= block.space_before
        for line in lines:
            if cursor - leading < margin:
                if len(pdf.pages) >= MAX_PAGES:
                    break
                page = pdf.add_blank_page(page_size=page_size)
                cursor = height - margin
            cursor -= leading
            if line:
                style = TextStyle(
                    font=block.font,
                    size=block.size,
                    color=block.color,
                    bold=block.bold,
                    align="left",
                )
                stamp = overlay.text_stamp(line, style)
                if paragraph_is_rtl(line):
                    x = width - margin - stamp.width
                else:
                    x = margin + block.indent
                overlay.place(pdf.pages[-1], stamp, translate(x, cursor - stamp.height * 0.22))
        cursor -= block.space_after
    overlay.finalize()
    del page
    return pdf
