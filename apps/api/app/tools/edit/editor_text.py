import io
import re
from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium
from pypdfium2 import raw

from app.text.fonts import FontKey
from app.text.geometry import PageGeometry
from app.tools.security.redact import user_to_visual

MAX_MATCHES = 2000
REMOVE_OVERLAP = 0.6
COVER_PAD = 1.0
CONTAINED_FRACTION = 0.9


@dataclass(frozen=True)
class Replacement:
    page_index: int
    left: float
    bottom: float
    right: float
    top: float
    text: str
    font: FontKey
    size: float
    color: str
    bold: bool
    background: str


def overlap_fraction(
    inner: tuple[float, float, float, float], outer: tuple[float, float, float, float]
) -> float:
    left, bottom = max(inner[0], outer[0]), max(inner[1], outer[1])
    right, top = min(inner[2], outer[2]), min(inner[3], outer[3])
    area = max(inner[2] - inner[0], 0.01) * max(inner[3] - inner[1], 0.01)
    if right <= left or top <= bottom:
        return 0.0
    return (right - left) * (top - bottom) / area


def visual_bounds(
    geometry: PageGeometry, bounds: tuple[float, float, float, float]
) -> tuple[float, float, float, float]:
    first = user_to_visual(geometry, bounds[0], bounds[1])
    second = user_to_visual(geometry, bounds[2], bounds[3])
    return (
        min(first[0], second[0]),
        min(first[1], second[1]),
        max(first[0], second[0]),
        max(first[1], second[1]),
    )


def find_matches(
    path: Path,
    geometries: list[PageGeometry],
    page_indices: list[int],
    needle: str,
    replacement_text: str,
    match_case: bool,
    style: tuple[FontKey, str, bool, str],
) -> list[Replacement]:
    font, color, bold, background = style
    found: list[Replacement] = []
    flags = 0 if match_case else re.IGNORECASE
    pattern = re.compile(re.escape(needle), flags)
    document = pdfium.PdfDocument(str(path))
    try:
        for index in page_indices:
            page = document[index]
            textpage = page.get_textpage()
            try:
                objects = [
                    (obj.get_bounds(), visual_bounds(geometries[index], obj.get_bounds()))
                    for obj in page.get_objects(filter=(raw.FPDF_PAGEOBJ_TEXT,))
                ]
                handled: set[int] = set()
                searcher = textpage.search(needle, match_case=match_case)
                while len(found) < MAX_MATCHES:
                    match = searcher.get_next()
                    if match is None:
                        break
                    start, count = match
                    boxes = [textpage.get_charbox(position) for position in range(start, start + count)]
                    merged = (
                        min(box[0] for box in boxes),
                        min(box[1] for box in boxes),
                        max(box[2] for box in boxes),
                        max(box[3] for box in boxes),
                    )
                    visual = visual_bounds(geometries[index], merged)
                    size = float(raw.FPDFText_GetFontSize(textpage, start)) or visual[3] - visual[1]
                    container = next(
                        (
                            position
                            for position, (_, box) in enumerate(objects)
                            if overlap_fraction(visual, box) >= CONTAINED_FRACTION
                        ),
                        None,
                    )
                    if container is None:
                        found.append(
                            Replacement(index, *visual, replacement_text, font, size, color, bold, background)
                        )
                        continue
                    if container in handled:
                        continue
                    handled.add(container)
                    user_bounds, object_visual = objects[container]
                    line = textpage.get_text_bounded(
                        user_bounds[0] + 0.1, user_bounds[1] + 0.1, user_bounds[2] - 0.1, user_bounds[3] - 0.1
                    )
                    rewritten = pattern.sub(lambda _: replacement_text, line.replace("\r\n", "\n"))
                    found.append(
                        Replacement(index, *object_visual, rewritten, font, size, color, bold, background)
                    )
            finally:
                textpage.close()
                page.close()
    finally:
        document.close()
    return found


def remove_text_objects(path: Path, geometries: list[PageGeometry], replacements: list[Replacement]) -> bytes:
    by_page: dict[int, list[Replacement]] = {}
    for replacement in replacements:
        by_page.setdefault(replacement.page_index, []).append(replacement)
    document = pdfium.PdfDocument(str(path))
    try:
        for index, regions in by_page.items():
            page = document[index]
            try:
                doomed = []
                for obj in page.get_objects(filter=(raw.FPDF_PAGEOBJ_TEXT,)):
                    box = visual_bounds(geometries[index], obj.get_bounds())
                    if any(
                        overlap_fraction(
                            box,
                            (
                                r.left - COVER_PAD,
                                r.bottom - COVER_PAD,
                                r.right + COVER_PAD,
                                r.top + COVER_PAD,
                            ),
                        )
                        >= REMOVE_OVERLAP
                        for r in regions
                    ):
                        doomed.append(obj)
                for obj in doomed:
                    page.remove_obj(obj)
                if doomed:
                    page.gen_content()
            finally:
                page.close()
        buffer = io.BytesIO()
        document.save(buffer)
        return buffer.getvalue()
    finally:
        document.close()
