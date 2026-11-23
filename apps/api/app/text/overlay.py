import hashlib
import io
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

import pikepdf
from fontTools import subset
from fontTools.ttLib import TTFont

from app.text.bidi import Direction
from app.text.fonts import FontFace, FontKey
from app.text.geometry import Matrix
from app.text.shaping import ShapedLine, shape_line

logging.getLogger("fontTools").setLevel(logging.WARNING)

Layer = Literal["over", "under"]
Align = Literal["left", "center", "right"]
RGB = tuple[float, float, float]


@dataclass(frozen=True)
class TextStyle:
    font: FontKey
    size: float
    color: RGB = (0.0, 0.0, 0.0)
    opacity: float = 1.0
    bold: bool = False
    direction: Direction = "auto"
    align: Align = "center"
    line_spacing: float = 1.25


@dataclass(frozen=True)
class Stamp:
    form: pikepdf.Object
    width: float
    height: float


@dataclass(frozen=True)
class PreparedImage:
    width: int
    height: int
    data: bytes
    color_space: Literal["/DeviceRGB", "/DeviceGray", "/DeviceCMYK"]
    filter: Literal["/DCTDecode", "/FlateDecode"]
    alpha: bytes | None = None
    decode_inverted: bool = False


@dataclass
class _EmbeddedFont:
    face: FontFace
    font: pikepdf.Object
    descendant: pikepdf.Object
    descriptor: pikepdf.Object
    used: dict[int, str] = field(default_factory=dict)


def _number(value: float) -> str:
    text = f"{value:.4f}".rstrip("0").rstrip(".")
    return text if text not in {"", "-0"} else "0"


def matrix_operator(matrix: Matrix) -> str:
    return " ".join(_number(value) for value in matrix) + " cm"


def parse_hex_color(value: str) -> RGB:
    cleaned = value.strip().lstrip("#")
    if len(cleaned) == 3:
        cleaned = "".join(char * 2 for char in cleaned)
    if len(cleaned) != 6 or any(char not in "0123456789abcdefABCDEF" for char in cleaned):
        raise ValueError("Colors must look like #1A2B3C.")
    return (
        int(cleaned[0:2], 16) / 255,
        int(cleaned[2:4], 16) / 255,
        int(cleaned[4:6], 16) / 255,
    )


def _utf16_hex(text: str) -> str:
    return text.encode("utf-16-be").hex().upper()


def _to_unicode_cmap(used: dict[int, str]) -> bytes:
    entries = sorted(used.items())
    lines = [
        "/CIDInit /ProcSet findresource begin",
        "12 dict begin",
        "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        "/CMapName /Adobe-Identity-UCS def",
        "/CMapType 2 def",
        "1 begincodespacerange",
        "<0000> <FFFF>",
        "endcodespacerange",
    ]
    for start in range(0, len(entries), 100):
        chunk = entries[start : start + 100]
        lines.append(f"{len(chunk)} beginbfchar")
        lines.extend(f"<{gid:04X}> <{_utf16_hex(text)}>" for gid, text in chunk)
        lines.append("endbfchar")
    lines.extend(["endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"])
    return "\n".join(lines).encode("ascii")


def _subset_font(face: FontFace, gids: Sequence[int]) -> tuple[bytes, dict[int, int]]:
    font = TTFont(io.BytesIO(face.data))
    advances = {gid: font["hmtx"][font.getGlyphName(gid)][0] for gid in gids}
    options = subset.Options()
    options.retain_gids = True
    options.notdef_outline = True
    options.hinting = False
    options.layout_features = []
    options.glyph_names = False
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    options.drop_tables = [*options.drop_tables, "GSUB", "GPOS", "GDEF", "BASE", "JSTF", "MATH", "meta"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(gids=sorted({0, *gids}))
    subsetter.subset(font)
    buffer = io.BytesIO()
    font.save(buffer)
    font.close()
    return buffer.getvalue(), advances


class OverlayDocument:
    def __init__(self, pdf: pikepdf.Pdf, prefix: str = "Ov"):
        self.pdf = pdf
        self.prefix = prefix
        self._fonts: dict[tuple[FontKey, bool], _EmbeddedFont] = {}
        self._states: dict[float, pikepdf.Object] = {}
        self._text: dict[tuple[str, TextStyle], Stamp] = {}
        self._groups: dict[object, Stamp] = {}
        self._wrapped: set[tuple[int, int]] = set()

    def _font(self, face: FontFace) -> _EmbeddedFont:
        key = (face.key, face.bold)
        if key in self._fonts:
            return self._fonts[key]
        scale = 1000 / face.units_per_em
        descriptor = self.pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.FontDescriptor,
                FontName=pikepdf.Name("/" + face.postscript_name),
                Flags=4,
                FontBBox=pikepdf.Array([round(value * scale) for value in face.bbox]),
                ItalicAngle=face.italic_angle,
                Ascent=round(face.ascent * scale),
                Descent=round(face.descent * scale),
                CapHeight=round(face.cap_height * scale),
                StemV=120 if face.bold else 80,
            )
        )
        descendant = self.pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.Font,
                Subtype=pikepdf.Name.CIDFontType2,
                BaseFont=pikepdf.Name("/" + face.postscript_name),
                CIDSystemInfo=pikepdf.Dictionary(
                    Registry=pikepdf.String("Adobe"), Ordering=pikepdf.String("Identity"), Supplement=0
                ),
                FontDescriptor=descriptor,
                CIDToGIDMap=pikepdf.Name.Identity,
                DW=1000,
            )
        )
        font = self.pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.Font,
                Subtype=pikepdf.Name.Type0,
                BaseFont=pikepdf.Name("/" + face.postscript_name),
                Encoding=pikepdf.Name("/Identity-H"),
                DescendantFonts=pikepdf.Array([descendant]),
            )
        )
        embedded = _EmbeddedFont(face=face, font=font, descendant=descendant, descriptor=descriptor)
        self._fonts[key] = embedded
        return embedded

    def _state(self, opacity: float) -> pikepdf.Object:
        level = round(min(max(opacity, 0.0), 1.0), 3)
        if level not in self._states:
            self._states[level] = self.pdf.make_indirect(
                pikepdf.Dictionary(Type=pikepdf.Name.ExtGState, ca=level, CA=level)
            )
        return self._states[level]

    def _form(self, content: bytes, width: float, height: float, resources: pikepdf.Dictionary) -> Stamp:
        stream = pikepdf.Stream(self.pdf, content)
        stream.Type = pikepdf.Name.XObject
        stream.Subtype = pikepdf.Name.Form
        stream.BBox = pikepdf.Array([0, 0, width, height])
        stream.Resources = resources
        return Stamp(form=self.pdf.make_indirect(stream), width=width, height=height)

    def text_stamp(self, text: str, style: TextStyle) -> Stamp:
        cache_key = (text, style)
        if cache_key in self._text:
            return self._text[cache_key]
        lines: list[ShapedLine] = [
            shape_line(line, style.font, style.bold, style.size, style.direction) for line in text.split("\n")
        ]
        line_height = style.size * style.line_spacing
        tallest = max(line.ascent + line.descent for line in lines)
        box_line = max(line_height, tallest)
        width = max(*(line.width for line in lines), 0.01)
        height = box_line * len(lines)
        fonts: dict[tuple[FontKey, bool], str] = {}
        operations: list[str] = ["/GS0 gs", " ".join(_number(value) for value in style.color) + " rg", "BT"]
        for index, (line, source) in enumerate(zip(lines, text.split("\n"), strict=True)):
            operations.append(f"/Span << /ActualText <FEFF{_utf16_hex(source)}> >> BDC")
            baseline = height - (index + 1) * box_line + (box_line - line.ascent - line.descent) / 2
            baseline += line.descent
            if style.align == "left":
                cursor = 0.0
            elif style.align == "right":
                cursor = width - line.width
            else:
                cursor = (width - line.width) / 2
            for run in line.runs:
                embedded = self._font(run.face)
                font_key = (run.face.key, run.face.bold)
                if font_key not in fonts:
                    fonts[font_key] = f"/F{len(fonts)}"
                operations.append(f"{fonts[font_key]} {_number(style.size)} Tf")
                for glyph in run.glyphs:
                    if not embedded.used.get(glyph.gid):
                        embedded.used[glyph.gid] = glyph.text
                    x = cursor + glyph.x
                    y = baseline + glyph.y
                    operations.append(f"1 0 0 1 {_number(x)} {_number(y)} Tm <{glyph.gid:04X}> Tj")
                cursor += run.width
            operations.append("EMC")
        operations.append("ET")
        font_resources = pikepdf.Dictionary()
        for font_key, name in fonts.items():
            font_resources[name] = self._fonts[font_key].font
        resources = pikepdf.Dictionary(
            Font=font_resources, ExtGState=pikepdf.Dictionary(GS0=self._state(style.opacity))
        )
        stamp = self._form("\n".join(operations).encode("ascii"), width, height, resources)
        self._text[cache_key] = stamp
        return stamp

    def vector_stamp(
        self, content: str, width: float, height: float, opacity: float, blend: str | None = None
    ) -> Stamp:
        state = pikepdf.Dictionary(
            Type=pikepdf.Name.ExtGState, ca=round(opacity, 3), CA=round(opacity, 3)
        )
        if blend:
            state["/BM"] = pikepdf.Name("/" + blend)
        resources = pikepdf.Dictionary(ExtGState=pikepdf.Dictionary(GS0=self.pdf.make_indirect(state)))
        return self._form(("/GS0 gs\n" + content).encode("ascii"), width, height, resources)

    def image_stamp(self, image: PreparedImage, width: float, height: float, opacity: float) -> Stamp:
        cache_key = ("image", id(image), round(width, 3), round(height, 3), round(opacity, 3))
        if cache_key in self._groups:
            return self._groups[cache_key]
        xobject = self._image_xobject(image)
        content = f"/GS0 gs\n{_number(width)} 0 0 {_number(height)} 0 0 cm\n/Im0 Do".encode("ascii")
        resources = pikepdf.Dictionary(
            XObject=pikepdf.Dictionary(Im0=xobject),
            ExtGState=pikepdf.Dictionary(GS0=self._state(opacity)),
        )
        stamp = self._form(content, width, height, resources)
        self._groups[cache_key] = stamp
        return stamp

    def _image_xobject(self, image: PreparedImage) -> pikepdf.Object:
        cache_key = ("image-xobject", id(image))
        cached = self._groups.get(cache_key)
        if cached is not None:
            return cached.form
        stream = pikepdf.Stream(self.pdf, image.data)
        stream.Type = pikepdf.Name.XObject
        stream.Subtype = pikepdf.Name.Image
        stream.Width = image.width
        stream.Height = image.height
        stream.ColorSpace = pikepdf.Name(image.color_space)
        stream.BitsPerComponent = 8
        stream.Filter = pikepdf.Name(image.filter)
        if image.decode_inverted:
            stream.Decode = pikepdf.Array([1, 0, 1, 0, 1, 0, 1, 0])
        if image.alpha is not None:
            mask = pikepdf.Stream(self.pdf, image.alpha)
            mask.Type = pikepdf.Name.XObject
            mask.Subtype = pikepdf.Name.Image
            mask.Width = image.width
            mask.Height = image.height
            mask.ColorSpace = pikepdf.Name.DeviceGray
            mask.BitsPerComponent = 8
            mask.Filter = pikepdf.Name.FlateDecode
            stream.SMask = self.pdf.make_indirect(mask)
        indirect = self.pdf.make_indirect(stream)
        self._groups[cache_key] = Stamp(form=indirect, width=image.width, height=image.height)
        return indirect

    def group(
        self, key: object, width: float, height: float, placements: Sequence[tuple[Stamp, Matrix]]
    ) -> Stamp:
        cache_key = ("group", key)
        if cache_key in self._groups:
            return self._groups[cache_key]
        names: dict[int, str] = {}
        xobjects = pikepdf.Dictionary()
        operations: list[str] = []
        for stamp, matrix in placements:
            identity = id(stamp)
            if identity not in names:
                names[identity] = f"/S{len(names)}"
                xobjects[names[identity]] = stamp.form
            operations.append(f"q {matrix_operator(matrix)} {names[identity]} Do Q")
        stamp = self._form(
            "\n".join(operations).encode("ascii"), width, height, pikepdf.Dictionary(XObject=xobjects)
        )
        self._groups[cache_key] = stamp
        return stamp

    def _page_resources(self, page: pikepdf.Page) -> None:
        if "/Resources" in page.obj and isinstance(page.obj.Resources, pikepdf.Dictionary):
            return
        inherited: object = None
        node = page.obj.get("/Parent")
        for _ in range(64):
            if not isinstance(node, pikepdf.Dictionary):
                break
            if "/Resources" in node:
                inherited = node.Resources
                break
            node = node.get("/Parent")
        copy = pikepdf.Dictionary()
        if isinstance(inherited, pikepdf.Dictionary):
            for name, value in inherited.items():
                copy[name] = value
        page.obj.Resources = copy

    def place(self, page: pikepdf.Page, stamp: Stamp, matrix: Matrix, layer: Layer = "over") -> None:
        self._page_resources(page)
        name = page.add_resource(stamp.form, pikepdf.Name.XObject, prefix=self.prefix)
        snippet = f"q {matrix_operator(matrix)} {name} Do Q\n".encode("ascii")
        objgen = page.obj.objgen
        if layer == "under":
            page.contents_add(pikepdf.Stream(self.pdf, snippet), prepend=True)
            return
        if objgen not in self._wrapped:
            page.contents_add(pikepdf.Stream(self.pdf, b"q\n"), prepend=True)
            page.contents_add(pikepdf.Stream(self.pdf, b"\nQ\n"), prepend=False)
            self._wrapped.add(objgen)
        page.contents_add(pikepdf.Stream(self.pdf, snippet), prepend=False)

    def finalize(self) -> None:
        for embedded in self._fonts.values():
            gids = sorted(embedded.used)
            data, advances = _subset_font(embedded.face, gids)
            scale = 1000 / embedded.face.units_per_em
            tag = "".join(
                chr(ord("A") + byte % 26) for byte in hashlib.sha256(repr(gids).encode("ascii")).digest()[:6]
            )
            name = pikepdf.Name(f"/{tag}+{embedded.face.postscript_name}")
            file_stream = pikepdf.Stream(self.pdf, data)
            file_stream.Length1 = len(data)
            embedded.descriptor.FontFile2 = self.pdf.make_indirect(file_stream)
            embedded.descriptor.FontName = name
            embedded.descendant.BaseFont = name
            embedded.font.BaseFont = name
            widths = pikepdf.Array()
            for gid in gids:
                widths.append(gid)
                widths.append(pikepdf.Array([round(advances[gid] * scale)]))
            embedded.descendant.W = widths
            embedded.font.ToUnicode = self.pdf.make_indirect(
                pikepdf.Stream(self.pdf, _to_unicode_cmap(embedded.used))
            )
