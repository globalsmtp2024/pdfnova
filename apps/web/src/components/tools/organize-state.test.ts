import { describe, expect, it } from "vitest";

import {
  HISTORY_LIMIT,
  applyAction,
  organizePayload,
  pagesForFile,
  record,
  redo,
  undo,
  type OrganizeHistory,
} from "@/components/tools/organize-state";

const start = (): OrganizeHistory => ({ past: [], present: pagesForFile("a", 0, 4), future: [] });
const order = (history: OrganizeHistory) =>
  history.present.map((page) => (page.source === "blank" ? "B" : `${page.page}`)).join("");

describe("organize state", () => {
  it("moves, reverses and restores original order", () => {
    let history = record(start(), { type: "move", from: 0, to: 3 });
    expect(order(history)).toBe("2341");
    history = record(history, { type: "reverse" });
    expect(order(history)).toBe("1432");
    history = record(history, { type: "sortOriginal" });
    expect(order(history)).toBe("1234");
  });

  it("rotates, duplicates, deletes and inserts blanks", () => {
    let history = record(start(), { type: "rotate", ids: ["a-2"], delta: 90 });
    history = record(history, { type: "rotate", ids: ["a-2"], delta: 270 });
    expect(history.present[1].rotate).toBe(0);
    history = record(history, { type: "duplicate", ids: ["a-1"] });
    expect(order(history)).toBe("11234");
    history = record(history, { type: "delete", ids: ["a-3", "a-4"] });
    expect(order(history)).toBe("112");
    history = record(history, { type: "insertBlank", after: 0 });
    expect(order(history)).toBe("1B12");
  });

  it("moves a selection to a position", () => {
    const history = record(start(), { type: "moveTo", ids: ["a-3", "a-4"], position: 0 });
    expect(order(history)).toBe("3412");
  });

  it("undoes and redoes, clearing redo after a new edit", () => {
    let history = record(start(), { type: "reverse" });
    history = record(history, { type: "delete", ids: ["a-1"] });
    history = undo(history);
    expect(order(history)).toBe("4321");
    history = undo(history);
    expect(order(history)).toBe("1234");
    history = redo(history);
    expect(order(history)).toBe("4321");
    history = record(history, { type: "move", from: 0, to: 1 });
    expect(history.future).toHaveLength(0);
    expect(undo(undo(undo(undo(history)))).past).toHaveLength(0);
  });

  it("keeps at most fifty undo steps", () => {
    let history = start();
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) {
      history = record(history, { type: "rotate", ids: ["a-1"], delta: 90 });
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
  });

  it("ignores no-op moves without adding history", () => {
    const history = start();
    expect(record(history, { type: "move", from: 1, to: 1 })).toBe(history);
    expect(applyAction(history.present, { type: "move", from: 9, to: 0 })).toBe(history.present);
  });

  it("builds the payload with file positions from stable keys", () => {
    const pages = [...pagesForFile("b", 1, 1), ...pagesForFile("a", 0, 1)];
    const withBlank = applyAction(pages, { type: "insertBlank", after: 0 });
    expect(organizePayload(withBlank, ["a", "b"]).pages).toEqual([
      { source: "file", file: 1, page: 1, rotate: 0 },
      { source: "blank", rotate: 0 },
      { source: "file", file: 0, page: 1, rotate: 0 },
    ]);
    expect(organizePayload(withBlank, ["a"]).pages).toHaveLength(2);
  });
});
