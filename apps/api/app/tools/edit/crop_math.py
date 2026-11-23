from dataclasses import dataclass
from typing import Literal

POINTS_PER_INCH = 72.0
POINTS_PER_MM = 72.0 / 25.4
MIN_CROP_POINTS = 1.0

Unit = Literal["pt", "mm", "in", "%"]


class CropGeometryError(ValueError):
    pass


@dataclass(frozen=True)
class Box:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0

    def as_list(self) -> list[float]:
        return [self.x0, self.y0, self.x1, self.y1]


@dataclass(frozen=True)
class Margins:
    top: float
    right: float
    bottom: float
    left: float


def normalize_box(values: list[float]) -> Box:
    if len(values) != 4:
        raise CropGeometryError("A page box needs four numbers.")
    x0, y0, x1, y1 = values
    return Box(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))


def intersect(first: Box, second: Box) -> Box:
    result = Box(
        max(first.x0, second.x0), max(first.y0, second.y0), min(first.x1, second.x1), min(first.y1, second.y1)
    )
    if result.width <= 0 or result.height <= 0:
        raise CropGeometryError("The page boxes don't overlap.")
    return result


def normalize_rotation(rotation: int) -> int:
    value = rotation % 360
    if value % 90:
        raise CropGeometryError("Page rotation must be a multiple of 90 degrees.")
    return value


def display_size(box: Box, rotation: int) -> tuple[float, float]:
    if normalize_rotation(rotation) in (90, 270):
        return box.height, box.width
    return box.width, box.height


def display_to_pdf_margins(margins: Margins, rotation: int) -> Margins:
    turn = normalize_rotation(rotation)
    if turn == 90:
        return Margins(top=margins.right, right=margins.bottom, bottom=margins.left, left=margins.top)
    if turn == 180:
        return Margins(top=margins.bottom, right=margins.left, bottom=margins.top, left=margins.right)
    if turn == 270:
        return Margins(top=margins.left, right=margins.top, bottom=margins.right, left=margins.bottom)
    return margins


def pdf_to_display_margins(margins: Margins, rotation: int) -> Margins:
    turn = normalize_rotation(rotation)
    return display_to_pdf_margins(margins, (360 - turn) % 360)


def crop_box(page_box: Box, display_margins: Margins, rotation: int) -> Box:
    values = (display_margins.top, display_margins.right, display_margins.bottom, display_margins.left)
    if any(value < 0 for value in values):
        raise CropGeometryError("Crop margins can't be negative.")
    pdf = display_to_pdf_margins(display_margins, rotation)
    result = Box(
        page_box.x0 + pdf.left, page_box.y0 + pdf.bottom, page_box.x1 - pdf.right, page_box.y1 - pdf.top
    )
    if result.width < MIN_CROP_POINTS or result.height < MIN_CROP_POINTS:
        raise CropGeometryError("The crop area is empty or larger than the page.")
    return result


def to_points(value: float, unit: Unit, reference: float) -> float:
    if unit == "pt":
        return value
    if unit == "mm":
        return value * POINTS_PER_MM
    if unit == "in":
        return value * POINTS_PER_INCH
    return value / 100.0 * reference


def from_points(value: float, unit: Unit, reference: float) -> float:
    if unit == "pt":
        return value
    if unit == "mm":
        return value / POINTS_PER_MM
    if unit == "in":
        return value / POINTS_PER_INCH
    return value / reference * 100.0 if reference > 0 else 0.0


def pixel_bounds_to_margins(
    bounds: tuple[int, int, int, int],
    image_size: tuple[int, int],
    page_display_size: tuple[float, float],
    padding: float,
) -> Margins:
    left, upper, right, lower = bounds
    image_width, image_height = image_size
    scale_x = page_display_size[0] / image_width
    scale_y = page_display_size[1] / image_height
    return Margins(
        top=max(upper * scale_y - padding, 0.0),
        right=max((image_width - right) * scale_x - padding, 0.0),
        bottom=max((image_height - lower) * scale_y - padding, 0.0),
        left=max(left * scale_x - padding, 0.0),
    )
