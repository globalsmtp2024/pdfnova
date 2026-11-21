export type OrganizePage = {
  id: string;
  source: "file" | "blank";
  fileKey: string;
  file: number;
  page: number;
  rotate: 0 | 90 | 180 | 270;
};

export type OrganizeAction =
  | { type: "move"; from: number; to: number }
  | { type: "moveTo"; ids: string[]; position: number }
  | { type: "rotate"; ids: string[]; delta: 90 | 270 }
  | { type: "delete"; ids: string[] }
  | { type: "duplicate"; ids: string[] }
  | { type: "insertBlank"; after: number }
  | { type: "reverse" }
  | { type: "sortOriginal" }
  | { type: "append"; pages: OrganizePage[] };

export type OrganizeHistory = {
  past: OrganizePage[][];
  present: OrganizePage[];
  future: OrganizePage[][];
};

export const HISTORY_LIMIT = 50;

let counter = 0;
export function nextPageId(prefix = "p"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function pagesForFile(fileKey: string, file: number, count: number): OrganizePage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${fileKey}-${index + 1}`,
    source: "file",
    fileKey,
    file,
    page: index + 1,
    rotate: 0,
  }));
}

function rotateBy(value: OrganizePage["rotate"], delta: 90 | 270): OrganizePage["rotate"] {
  return ((value + delta) % 360) as OrganizePage["rotate"];
}

export function applyAction(pages: OrganizePage[], action: OrganizeAction): OrganizePage[] {
  switch (action.type) {
    case "move": {
      if (action.from === action.to || action.from < 0 || action.from >= pages.length) return pages;
      const next = [...pages];
      const [moved] = next.splice(action.from, 1);
      next.splice(Math.min(Math.max(action.to, 0), next.length), 0, moved);
      return next;
    }
    case "moveTo": {
      const chosen = new Set(action.ids);
      const moving = pages.filter((page) => chosen.has(page.id));
      const rest = pages.filter((page) => !chosen.has(page.id));
      const position = Math.min(Math.max(action.position, 0), rest.length);
      return [...rest.slice(0, position), ...moving, ...rest.slice(position)];
    }
    case "rotate": {
      const chosen = new Set(action.ids);
      return pages.map((page) =>
        chosen.has(page.id) ? { ...page, rotate: rotateBy(page.rotate, action.delta) } : page,
      );
    }
    case "delete": {
      const chosen = new Set(action.ids);
      return pages.filter((page) => !chosen.has(page.id));
    }
    case "duplicate": {
      const chosen = new Set(action.ids);
      return pages.flatMap((page) =>
        chosen.has(page.id) ? [page, { ...page, id: nextPageId("d") }] : [page],
      );
    }
    case "insertBlank": {
      const next = [...pages];
      const position = Math.min(Math.max(action.after + 1, 0), next.length);
      next.splice(position, 0, {
        id: nextPageId("b"),
        source: "blank",
        fileKey: "",
        file: 0,
        page: 1,
        rotate: 0,
      });
      return next;
    }
    case "reverse":
      return [...pages].reverse();
    case "sortOriginal":
      return [...pages].sort((a, b) =>
        a.source !== b.source ? (a.source === "file" ? -1 : 1) : a.file - b.file || a.page - b.page,
      );
    case "append":
      return [...pages, ...action.pages];
  }
}

export function record(history: OrganizeHistory, action: OrganizeAction): OrganizeHistory {
  const next = applyAction(history.present, action);
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function undo(history: OrganizeHistory): OrganizeHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: OrganizeHistory): OrganizeHistory {
  const [following, ...rest] = history.future;
  if (!following) return history;
  return { past: [...history.past, history.present], present: following, future: rest };
}

export function organizePayload(
  pages: OrganizePage[],
  fileKeys: string[],
): { pages: Record<string, unknown>[] } {
  const position = new Map(fileKeys.map((key, index) => [key, index]));
  return {
    pages: pages
      .filter((page) => page.source === "blank" || position.has(page.fileKey))
      .map((page) =>
        page.source === "blank"
          ? { source: "blank", rotate: page.rotate }
          : {
              source: "file",
              file: position.get(page.fileKey),
              page: page.page,
              rotate: page.rotate,
            },
      ),
  };
}
