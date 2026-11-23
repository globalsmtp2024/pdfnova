import math
from dataclasses import dataclass
from typing import Any, Literal

import pikepdf

Anchor = Literal[
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-center",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
]
ANCHORS: tuple[Anchor, ...] = (
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-center",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
)
Matrix = tuple[float, float, float, float, float, float]
IDENTITY: Matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
MAX_PAGE_SIDE = 14400 * 75.0


@dataclass(frozen=True)
class PageGeometry:
    left: float
    bottom: float
    width: float
    height: float
    rotation: int

    @property
    def visual_width(self) -> float:
        return self.height if self.rotation in (90, 270) else self.width

    @property
    def visual_height(self) -> float:
        return self.width if self.rotation in (90, 270) else self.height

    def key(self) -> tuple[float, float, float, float, int]:
        return (
            round(self.left, 3),
            round(self.bottom, 3),
            round(self.width, 3),
            round(self.height, 3),
            self.rotation,
        )

    def visual_to_user(self) -> Matrix:
        left, bottom, width, height = self.left, self.bottom, self.width, self.height
        if self.rotation == 90:
            return (0.0, 1.0, -1.0, 0.0, left + width, bottom)
        if self.rotation == 180:
            return (-1.0, 0.0, 0.0, -1.0, left + width, bottom + height)
        if self.rotation == 270:
            return (0.0, -1.0, 1.0, 0.0, left, bottom + height)
        return (1.0, 0.0, 0.0, 1.0, left, bottom)


def _inherited(page: pikepdf.Page, key: str) -> Any:
    node: Any = page.obj
    for _ in range(64):
        if node is None or not isinstance(node, pikepdf.Dictionary):
            return None
        if key in node:
            return node[key]
        node = node.get("/Parent")
    return None


def _box(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, pikepdf.Array) or len(value) != 4:
        return None
    try:
        numbers = [float(value[position]) for position in range(4)]
    except (TypeError, ValueError):
        return None
    if not all(math.isfinite(number) for number in numbers):
        return None
    x0, x1 = sorted((numbers[0], numbers[2]))
    y0, y1 = sorted((numbers[1], numbers[3]))
    if x1 - x0 <= 0 or y1 - y0 <= 0:
        return None
    return (x0, y0, x1, y1)


def page_rotation_inherited(page: pikepdf.Page) -> int:
    value = _inherited(page, "/Rotate")
    try:
        angle = int(value) if value is not None else 0
    except (TypeError, ValueError):
        angle = 0
    return (round(angle / 90) * 90) % 360


def page_geometry(page: pikepdf.Page) -> PageGeometry:
    media = _box(_inherited(page, "/MediaBox")) or (0.0, 0.0, 612.0, 792.0)
    crop = _box(_inherited(page, "/CropBox")) or media
    left, bottom = max(media[0], crop[0]), max(media[1], crop[1])
    right, top = min(media[2], crop[2]), min(media[3], crop[3])
    if right - left <= 0 or top - bottom <= 0:
        left, bottom, right, top = media
    width = min(right - left, MAX_PAGE_SIDE)
    height = min(top - bottom, MAX_PAGE_SIDE)
    return PageGeometry(left, bottom, width, height, page_rotation_inherited(page))


def multiply(first: Matrix, second: Matrix) -> Matrix:
    a1, b1, c1, d1, e1, f1 = first
    a2, b2, c2, d2, e2, f2 = second
    return (
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2,
    )


def translate(x: float, y: float) -> Matrix:
    return (1.0, 0.0, 0.0, 1.0, x, y)


def rotate(degrees: float) -> Matrix:
    radians = math.radians(degrees)
    cos, sin = math.cos(radians), math.sin(radians)
    return (cos, sin, -sin, cos, 0.0, 0.0)


def rotated_extent(width: float, height: float, degrees: float) -> tuple[float, float]:
    radians = math.radians(degrees)
    cos, sin = abs(math.cos(radians)), abs(math.sin(radians))
    return (width * cos + height * sin, width * sin + height * cos)


def anchor_center(
    anchor: Anchor,
    page_width: float,
    page_height: float,
    box_width: float,
    box_height: float,
    margin_x: float,
    margin_y: float,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> tuple[float, float]:
    vertical, horizontal = anchor.split("-")
    if horizontal == "left":
        x = margin_x + box_width / 2
    elif horizontal == "right":
        x = page_width - margin_x - box_width / 2
    else:
        x = page_width / 2
    if vertical == "bottom":
        y = margin_y + box_height / 2
    elif vertical == "top":
        y = page_height - margin_y - box_height / 2
    else:
        y = page_height / 2
    return (x + offset_x, y + offset_y)


def mirrored(anchor: Anchor) -> Anchor:
    vertical, horizontal = anchor.split("-")
    swapped = {"left": "right", "right": "left"}.get(horizontal, horizontal)
    result: Anchor = f"{vertical}-{swapped}"  # type: ignore[assignment]
    return result


def visual_matrix(center: tuple[float, float], width: float, height: float, degrees: float) -> Matrix:
    local = multiply(translate(-width / 2, -height / 2), rotate(degrees))
    return multiply(local, translate(center[0], center[1]))


def stamp_matrix(
    geometry: PageGeometry, center: tuple[float, float], width: float, height: float, degrees: float
) -> Matrix:
    return multiply(visual_matrix(center, width, height, degrees), geometry.visual_to_user())


def tile_centers(
    page_width: float,
    page_height: float,
    box_width: float,
    box_height: float,
    degrees: float,
    spacing: float,
    limit: int,
) -> list[tuple[float, float]]:
    extent_x, extent_y = rotated_extent(box_width, box_height, degrees)
    step_x = max(extent_x + spacing, 1.0)
    step_y = max(extent_y + spacing, 1.0)
    while math.ceil(page_width / step_x + 1) * math.ceil(page_height / step_y + 1) > limit:
        step_x *= 1.25
        step_y *= 1.25
    columns = math.ceil(page_width / step_x) + 1
    rows = math.ceil(page_height / step_y) + 1
    start_x = page_width / 2 - (columns - 1) * step_x / 2
    start_y = page_height / 2 - (rows - 1) * step_y / 2
    centers: list[tuple[float, float]] = []
    for row in range(rows):
        shift = step_x / 2 if row % 2 else 0.0
        for column in range(columns):
            centers.append((start_x + column * step_x + shift, start_y + row * step_y))
    return centers
