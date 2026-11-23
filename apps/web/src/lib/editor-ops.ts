export type EditorTool =
  | "select"
  | "text"
  | "image"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "highlight"
  | "draw"
  | "note"
  | "link"
  | "edit_text";

type Base = { id: string; page: number };

export type TextOp = Base & {
  type: "text";
  x: number;
  y: number;
  text: string;
  font: string;
  size: number;
  color: string;
  bold: boolean;
  align: "left" | "center" | "right";
  opacity: number;
  rotation: number;
};
export type ImageOp = Base & {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  image_data: string;
  preview: string;
  opacity: number;
  rotation: number;
};
export type ShapeOp = Base & {
  type: "rectangle" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
  stroke_width: number;
  opacity: number;
};
export type LineOp = Base & {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  stroke_width: number;
  arrow: boolean;
  opacity: number;
};
export type HighlightOp = Base & {
  type: "highlight";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
};
export type DrawOp = Base & {
  type: "draw";
  points: [number, number][];
  color: string;
  stroke_width: number;
  opacity: number;
};
export type NoteOp = Base & { type: "note"; x: number; y: number; text: string; color: string };
export type LinkOp = Base & {
  type: "link";
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
};

export type ReplaceTextOp = Base & {
  type: "replace_text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  font: string;
  size: number;
  color: string;
  bold: boolean;
  background: string;
};
export type FindReplaceOp = Base & {
  type: "find_replace";
  find: string;
  replace: string;
  match_case: boolean;
  pages: string;
  font: string;
  color: string;
  bold: boolean;
  background: string;
};

export type EditOp = ReplaceTextOp | FindReplaceOp | TextOp | ImageOp | ShapeOp | LineOp | HighlightOp | DrawOp | NoteOp | LinkOp;

export type History = { past: EditOp[][]; present: EditOp[]; future: EditOp[][] };

export const EMPTY_HISTORY: History = { past: [], present: [], future: [] };
const HISTORY_LIMIT = 200;

export function commit(history: History, next: EditOp[]): History {
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function moveOp(op: EditOp, dx: number, dy: number): EditOp {
  switch (op.type) {
    case "line":
      return {
        ...op,
        x1: clamp(op.x1 + dx, 0, 100),
        y1: clamp(op.y1 + dy, 0, 100),
        x2: clamp(op.x2 + dx, 0, 100),
        y2: clamp(op.y2 + dy, 0, 100),
      };
    case "draw":
      return {
        ...op,
        points: op.points.map(([x, y]) => [clamp(x + dx, 0, 100), clamp(y + dy, 0, 100)]),
      };
    case "find_replace":
      return op;
    default:
      return { ...op, x: clamp(op.x + dx, 0, 100), y: clamp(op.y + dy, 0, 100) };
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function toPayload(ops: EditOp[]): Record<string, unknown>[] {
  return ops.map((op) => {
    const copy: Record<string, unknown> = { ...op };
    delete copy.id;
    delete copy.preview;
    if (op.type === "find_replace") delete copy.page;
    return copy;
  });
}

export function opsOnPage(ops: EditOp[], page: number): EditOp[] {
  return ops.filter((op) => op.page === page);
}
