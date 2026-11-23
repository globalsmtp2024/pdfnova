from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fontTools.ttLib import TTFont

FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

FontKey = Literal[
    "inter",
    "noto-sans",
    "noto-serif",
    "noto-sans-mono",
    "noto-sans-arabic",
    "noto-nastaliq-urdu",
]
FONT_KEYS: tuple[FontKey, ...] = (
    "inter",
    "noto-sans",
    "noto-serif",
    "noto-sans-mono",
    "noto-sans-arabic",
    "noto-nastaliq-urdu",
)
_FILES: dict[FontKey, tuple[str, str]] = {
    "inter": ("inter", "Inter"),
    "noto-sans": ("notosans", "NotoSans"),
    "noto-serif": ("notoserif", "NotoSerif"),
    "noto-sans-mono": ("notosansmono", "NotoSansMono"),
    "noto-sans-arabic": ("notosansarabic", "NotoSansArabic"),
    "noto-nastaliq-urdu": ("notonastaliqurdu", "NotoNastaliqUrdu"),
}


@dataclass(frozen=True)
class FontFace:
    key: FontKey
    bold: bool
    path: Path
    postscript_name: str
    units_per_em: int
    ascent: int
    descent: int
    cap_height: int
    bbox: tuple[int, int, int, int]
    italic_angle: float
    codepoints: frozenset[int]

    @property
    def data(self) -> bytes:
        return _font_bytes(self.path)

    def covers(self, text: str) -> bool:
        return all(ord(char) in self.codepoints or not char.strip() for char in text)


@lru_cache(maxsize=32)
def _font_bytes(path: Path) -> bytes:
    return path.read_bytes()


def font_path(key: FontKey, bold: bool) -> Path:
    folder, stem = _FILES[key]
    return FONT_DIR / folder / f"{stem}-{'Bold' if bold else 'Regular'}.ttf"


@lru_cache(maxsize=32)
def load_face(key: FontKey, bold: bool = False) -> FontFace:
    path = font_path(key, bold)
    font = TTFont(path, lazy=True)
    try:
        head = font["head"]
        hhea = font["hhea"]
        os2 = font.get("OS/2")
        post = font["post"]
        name = f"{_FILES[key][1]}-{'Bold' if bold else 'Regular'}"
        cmap = font.getBestCmap() or {}
        cap_height = int(getattr(os2, "sCapHeight", 0) or hhea.ascent * 0.7)
        return FontFace(
            key=key,
            bold=bold,
            path=path,
            postscript_name="".join(char for char in name if char.isalnum() or char == "-"),
            units_per_em=int(head.unitsPerEm),
            ascent=int(hhea.ascent),
            descent=int(hhea.descent),
            cap_height=cap_height,
            bbox=(int(head.xMin), int(head.yMin), int(head.xMax), int(head.yMax)),
            italic_angle=float(post.italicAngle),
            codepoints=frozenset(cmap),
        )
    finally:
        font.close()


def fallback_chain(key: FontKey, rtl: bool) -> list[FontKey]:
    chain: list[FontKey] = [key]
    extra: list[FontKey] = (
        ["noto-sans-arabic", "noto-nastaliq-urdu", "noto-sans"] if rtl else ["noto-sans", "noto-sans-arabic"]
    )
    chain.extend(candidate for candidate in extra if candidate not in chain)
    return chain


def face_for(text: str, key: FontKey, bold: bool, rtl: bool) -> FontFace:
    chain = fallback_chain(key, rtl)
    for candidate in chain:
        face = load_face(candidate, bold)
        if face.covers(text):
            return face
    return load_face(chain[0], bold)
