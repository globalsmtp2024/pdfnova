export const POINTS_PER_INCH = 72;
export const POINTS_PER_MM = 72 / 25.4;
export const MIN_CROP_POINTS = 1;

export type Unit = "pt" | "mm" | "in" | "%";
export type Rotation = 0 | 90 | 180 | 270;
export type Margins = { top: number; right: number; bottom: number; left: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type Side = keyof Margins;

export const SIDES: Side[] = ["top", "right", "bottom", "left"];
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const PAPER_ASPECTS = { a4: 210 / 297, letter: 8.5 / 11 } as const;

export function normalizeRotation(rotation: number): Rotation {
  const value = ((rotation % 360) + 360) % 360;
  if (value % 90 !== 0) throw new RangeError("Page rotation must be a multiple of 90 degrees.");
  return value as Rotation;
}

export function displaySize(box: Box, rotation: number): Size {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const turn = normalizeRotation(rotation);
  return turn === 90 || turn === 270 ? { width: height, height: width } : { width, height };
}

export function displayToPdfMargins(margins: Margins, rotation: number): Margins {
  const turn = normalizeRotation(rotation);
  if (turn === 90)
    return { top: margins.right, right: margins.bottom, bottom: margins.left, left: margins.top };
  if (turn === 180)
    return { top: margins.bottom, right: margins.left, bottom: margins.top, left: margins.right };
  if (turn === 270)
    return { top: margins.left, right: margins.top, bottom: margins.right, left: margins.bottom };
  return { ...margins };
}

export function pdfToDisplayMargins(margins: Margins, rotation: number): Margins {
  return displayToPdfMargins(margins, (360 - normalizeRotation(rotation)) % 360);
}

export function cropBox(page: Box, margins: Margins, rotation: number): Box | null {
  if (SIDES.some((side) => margins[side] < 0)) return null;
  const pdf = displayToPdfMargins(margins, rotation);
  const result = {
    x0: page.x0 + pdf.left,
    y0: page.y0 + pdf.bottom,
    x1: page.x1 - pdf.right,
    y1: page.y1 - pdf.top,
  };
  if (result.x1 - result.x0 < MIN_CROP_POINTS || result.y1 - result.y0 < MIN_CROP_POINTS)
    return null;
  return result;
}

export function toPoints(value: number, unit: Unit, reference: number): number {
  if (unit === "mm") return value * POINTS_PER_MM;
  if (unit === "in") return value * POINTS_PER_INCH;
  if (unit === "%") return (value / 100) * reference;
  return value;
}

export function fromPoints(value: number, unit: Unit, reference: number): number {
  if (unit === "mm") return value / POINTS_PER_MM;
  if (unit === "in") return value / POINTS_PER_INCH;
  if (unit === "%") return reference > 0 ? (value / reference) * 100 : 0;
  return value;
}

export function sideReference(side: Side, size: Size): number {
  return side === "top" || side === "bottom" ? size.height : size.width;
}

export function marginsToRect(size: Size, margins: Margins): Rect {
  return {
    x: margins.left,
    y: margins.top,
    width: size.width - margins.left - margins.right,
    height: size.height - margins.top - margins.bottom,
  };
}

export function rectToMargins(size: Size, rect: Rect): Margins {
  return {
    top: rect.y,
    right: size.width - rect.x - rect.width,
    bottom: size.height - rect.y - rect.height,
    left: rect.x,
  };
}

export function fullRect(size: Size): Rect {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

export function clampRect(rect: Rect, size: Size, minimum = MIN_CROP_POINTS): Rect {
  const width = clamp(rect.width, minimum, size.width);
  const height = clamp(rect.height, minimum, size.height);
  return {
    x: clamp(rect.x, 0, size.width - width),
    y: clamp(rect.y, 0, size.height - height),
    width,
    height,
  };
}

export function moveRect(rect: Rect, dx: number, dy: number, size: Size): Rect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, size);
}

export function resizeRect(
  rect: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  size: Size,
  aspect: number | null,
  minimum = MIN_CROP_POINTS,
): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - minimum);
  if (handle.includes("e")) right = clamp(right + dx, left + minimum, size.width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - minimum);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + minimum, size.height);
  if (aspect === null || aspect <= 0)
    return { x: left, y: top, width: right - left, height: bottom - top };
  const horizontal = handle.includes("e") || handle.includes("w");
  const vertical = handle.includes("n") || handle.includes("s");
  let width = right - left;
  let height = bottom - top;
  if (horizontal && !vertical) height = width / aspect;
  else if (vertical && !horizontal) width = height * aspect;
  else if (width / height > aspect) width = height * aspect;
  else height = width / aspect;
  const anchorX = handle.includes("w")
    ? right
    : handle.includes("e")
      ? left
      : rect.x + rect.width / 2;
  const anchorY = handle.includes("n")
    ? bottom
    : handle.includes("s")
      ? top
      : rect.y + rect.height / 2;
  const maxWidth = handle.includes("w")
    ? anchorX
    : handle.includes("e")
      ? size.width - anchorX
      : 2 * Math.min(anchorX, size.width - anchorX);
  const maxHeight = handle.includes("n")
    ? anchorY
    : handle.includes("s")
      ? size.height - anchorY
      : 2 * Math.min(anchorY, size.height - anchorY);
  const fit = Math.min(1, maxWidth / width, maxHeight / height);
  width *= fit;
  height *= fit;
  const x = handle.includes("w")
    ? anchorX - width
    : handle.includes("e")
      ? anchorX
      : anchorX - width / 2;
  const y = handle.includes("n")
    ? anchorY - height
    : handle.includes("s")
      ? anchorY
      : anchorY - height / 2;
  return { x, y, width, height };
}

export function aspectRect(size: Size, aspect: number): Rect {
  const oriented = size.width > size.height ? 1 / aspect : aspect;
  let width = size.width;
  let height = width / oriented;
  if (height > size.height) {
    height = size.height;
    width = height * oriented;
  }
  return { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height };
}

export function hasCrop(margins: Margins, tolerance = 0.01): boolean {
  return SIDES.some((side) => margins[side] > tolerance);
}

export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
