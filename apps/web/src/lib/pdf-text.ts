type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type TextPage = {
  getViewport: (options: { scale: number }) => { transform: number[] };
  getTextContent: () => Promise<{ items: unknown[] }>;
};

export type TextDocument = { getPage: (index: number) => Promise<unknown> };

export type Region = { x: number; y: number; width: number; height: number };

function multiply(first: number[], second: number[]): number[] {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}

function isTextItem(value: unknown): value is TextItem {
  return typeof value === "object" && value !== null && "str" in value && "transform" in value;
}

export async function textInRegion(
  document: TextDocument,
  pageIndex: number,
  scale: number,
  pageWidth: number,
  pageHeight: number,
  region: Region,
): Promise<{ text: string; size: number } | null> {
  const page = (await document.getPage(pageIndex + 1)) as TextPage;
  const viewport = page.getViewport({ scale });
  const content = await page.getTextContent();
  const left = (region.x / 100) * pageWidth;
  const right = ((region.x + region.width) / 100) * pageWidth;
  const top = (region.y / 100) * pageHeight;
  const bottom = ((region.y + region.height) / 100) * pageHeight;
  const hits: { text: string; x: number; y: number; size: number }[] = [];
  for (const item of content.items) {
    if (!isTextItem(item) || !item.str.trim()) continue;
    const matrix = multiply(viewport.transform, item.transform);
    const baselineX = matrix[4];
    const baselineY = matrix[5];
    const itemHeight = Math.hypot(matrix[2], matrix[3]);
    const centerX = baselineX + (item.width * scale) / 2;
    const centerY = baselineY - itemHeight / 2;
    if (centerX >= left && centerX <= right && centerY >= top && centerY <= bottom) {
      hits.push({ text: item.str, x: baselineX, y: baselineY, size: itemHeight / scale });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));
  let text = "";
  let previousY = hits[0].y;
  for (const hit of hits) {
    if (text && Math.abs(hit.y - previousY) > 3) text += "\n";
    else if (text && !text.endsWith(" ")) text += " ";
    text += hit.text;
    previousY = hit.y;
  }
  const size = hits.reduce((total, hit) => total + hit.size, 0) / hits.length;
  return { text, size: Math.round(size * 10) / 10 };
}

export async function countMatches(
  document: TextDocument,
  pageCount: number,
  needle: string,
  matchCase: boolean,
): Promise<number> {
  if (!needle) return 0;
  const target = matchCase ? needle : needle.toLowerCase();
  let total = 0;
  for (let index = 0; index < pageCount; index += 1) {
    const page = (await document.getPage(index + 1)) as TextPage;
    const content = await page.getTextContent();
    const text = content.items
      .filter(isTextItem)
      .map((item) => item.str)
      .join("");
    const haystack = matchCase ? text : text.toLowerCase();
    let from = haystack.indexOf(target);
    while (from !== -1) {
      total += 1;
      from = haystack.indexOf(target, from + target.length);
    }
  }
  return total;
}
