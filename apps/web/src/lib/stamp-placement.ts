export type Anchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const ANCHORS: Anchor[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export type Point = { x: number; y: number };
export type PageSize = { width: number; height: number };

export const POINTS_PER_MM = 72 / 25.4;

export function anchorCenter(
  anchor: Anchor,
  page: PageSize,
  box: PageSize,
  marginX: number,
  marginY: number,
  offsetX = 0,
  offsetY = 0,
): Point {
  const [vertical, horizontal] = anchor.split("-");
  const x =
    horizontal === "left"
      ? marginX + box.width / 2
      : horizontal === "right"
        ? page.width - marginX - box.width / 2
        : page.width / 2;
  const y =
    vertical === "bottom"
      ? marginY + box.height / 2
      : vertical === "top"
        ? page.height - marginY - box.height / 2
        : page.height / 2;
  return { x: x + offsetX, y: y + offsetY };
}

export function mirrored(anchor: Anchor): Anchor {
  const [vertical, horizontal] = anchor.split("-");
  const swapped = horizontal === "left" ? "right" : horizontal === "right" ? "left" : horizontal;
  return `${vertical}-${swapped}` as Anchor;
}

export function rotatedExtent(width: number, height: number, degrees: number): PageSize {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return { width: width * cos + height * sin, height: width * sin + height * cos };
}

export function tileCenters(
  page: PageSize,
  box: PageSize,
  degrees: number,
  spacing: number,
  limit: number,
): Point[] {
  const extent = rotatedExtent(box.width, box.height, degrees);
  let stepX = Math.max(extent.width + spacing, 1);
  let stepY = Math.max(extent.height + spacing, 1);
  while (Math.ceil(page.width / stepX + 1) * Math.ceil(page.height / stepY + 1) > limit) {
    stepX *= 1.25;
    stepY *= 1.25;
  }
  const columns = Math.ceil(page.width / stepX) + 1;
  const rows = Math.ceil(page.height / stepY) + 1;
  const startX = page.width / 2 - ((columns - 1) * stepX) / 2;
  const startY = page.height / 2 - ((rows - 1) * stepY) / 2;
  const centers: Point[] = [];
  for (let row = 0; row < rows; row += 1) {
    const shift = row % 2 ? stepX / 2 : 0;
    for (let column = 0; column < columns; column += 1) {
      centers.push({ x: startX + column * stepX + shift, y: startY + row * stepY });
    }
  }
  return centers;
}

export function toScreen(
  point: Point,
  page: PageSize,
  scale: number,
): { left: number; top: number } {
  return { left: point.x * scale, top: (page.height - point.y) * scale };
}

export function visualPageSize(width: number, height: number, rotation: number): PageSize {
  const turned = ((rotation % 360) + 360) % 180 === 90;
  return turned ? { width: height, height: width } : { width, height };
}

export type NumberStyle =
  "decimal" | "roman_lower" | "roman_upper" | "letters_lower" | "letters_upper";
export type Digits = "western" | "arabic_indic" | "extended_arabic_indic";
export type LabelFormat = "n" | "page_n" | "n_of_total" | "page_n_of_total" | "custom";

export const LABEL_TEMPLATES: Record<Exclude<LabelFormat, "custom">, string> = {
  n: "{n}",
  page_n: "Page {n}",
  n_of_total: "{n} / {total}",
  page_n_of_total: "Page {n} of {total}",
};

const ROMAN: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function toRoman(value: number): string {
  if (value < 1 || value > 3999) return String(value);
  let rest = value;
  let result = "";
  for (const [amount, symbol] of ROMAN) {
    while (rest >= amount) {
      result += symbol;
      rest -= amount;
    }
  }
  return result;
}

export function toLetters(value: number): string {
  if (value < 1) return String(value);
  let rest = value;
  let result = "";
  while (rest > 0) {
    const remainder = (rest - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    rest = Math.floor((rest - 1) / 26);
  }
  return result;
}

const DIGIT_BASE: Partial<Record<Digits, number>> = {
  arabic_indic: 0x0660,
  extended_arabic_indic: 0x06f0,
};

export function formatNumber(value: number, style: NumberStyle, digits: Digits): string {
  if (style === "roman_upper") return toRoman(value);
  if (style === "roman_lower") return toRoman(value).toLowerCase();
  if (style === "letters_upper") return toLetters(value);
  if (style === "letters_lower") return toLetters(value).toLowerCase();
  const base = DIGIT_BASE[digits];
  const text = String(value);
  return base === undefined
    ? text
    : text.replace(/\d/g, (digit) => String.fromCharCode(base + Number(digit)));
}

export function templateProblem(template: string): "braces" | "fields" | "missing" | null {
  const fields: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of template) {
    if (char === "{") {
      if (depth) return "braces";
      depth = 1;
      current = "";
    } else if (char === "}") {
      if (!depth) return "braces";
      depth = 0;
      fields.push(current);
    } else if (depth) current += char;
  }
  if (depth) return "braces";
  if (fields.some((field) => field !== "n" && field !== "total")) return "fields";
  if (!fields.includes("n")) return "missing";
  return null;
}

export function pageLabel(
  format: LabelFormat,
  template: string,
  style: NumberStyle,
  digits: Digits,
  number: number,
  total: number,
): string {
  const pattern = format === "custom" ? template : LABEL_TEMPLATES[format];
  return pattern
    .replaceAll("{n}", formatNumber(number, style, digits))
    .replaceAll("{total}", formatNumber(total, style, digits));
}

export type NumberingRules = {
  startNumber: number;
  firstPage: number;
  skipFirst: number;
  skipLast: number;
  parity: "all" | "odd" | "even";
  pages: Set<number> | null;
};

export function numberedPages(
  rules: NumberingRules,
  count: number,
): { index: number; number: number; total: number }[] {
  const chosen: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (rules.pages && !rules.pages.has(index)) continue;
    if (rules.parity === "odd" && index % 2 !== 0) continue;
    if (rules.parity === "even" && index % 2 !== 1) continue;
    if (index < rules.firstPage - 1 || index < rules.skipFirst || index >= count - rules.skipLast)
      continue;
    chosen.push(index);
  }
  if (!chosen.length) return [];
  const first = chosen[0];
  const total = rules.startNumber + (chosen[chosen.length - 1] - first);
  return chosen.map((index) => ({ index, number: rules.startNumber + (index - first), total }));
}
