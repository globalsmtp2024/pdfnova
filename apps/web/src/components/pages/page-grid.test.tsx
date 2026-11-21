import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PageGrid } from "@/components/pages/page-grid";
import { PageRangeInput } from "@/components/pages/page-range-input";
import { renderWithIntl } from "@/test/render";

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe() {
        this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
});

function Harness({
  count = 6,
  onChange,
}: {
  count?: number;
  onChange?: (pages: number[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const update = (next: Set<number>) => {
    setSelected(next);
    onChange?.([...next].sort((a, b) => a - b));
  };
  return (
    <>
      <PageRangeInput pageCount={count} selected={selected} onSelectedChange={update} />
      <PageGrid
        fileId="file-1"
        pageCount={count}
        selected={selected}
        onSelectedChange={update}
        onRotatePage={() => undefined}
        label="Pages"
      />
    </>
  );
}

const option = (page: number) => screen.getByRole("option", { name: `Page ${page} of 6` });

describe("PageGrid with PageRangeInput", () => {
  it("renders lazy server thumbnails for each page", () => {
    renderWithIntl(<Harness />);
    expect(screen.getAllByRole("option")).toHaveLength(6);
    const image = option(1).querySelector("img");
    expect(image?.getAttribute("src")).toBe("/api/v1/files/file-1/pages/1/thumbnail?width=160");
  });

  it("selects with click, shift-click and ctrl-click, syncing the range input", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Harness />);
    await user.click(option(2));
    await user.keyboard("{Shift>}");
    await user.click(option(4));
    await user.keyboard("{/Shift}");
    expect(screen.getByRole("textbox")).toHaveValue("2-4");
    fireEvent.click(option(6), { ctrlKey: true });
    fireEvent.click(option(3), { ctrlKey: true });
    expect(screen.getByRole("textbox")).toHaveValue("2, 4, 6");
    expect(option(3)).toHaveAttribute("aria-selected", "false");
  });

  it("applies quick selections", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Harness />);
    await user.click(screen.getByRole("button", { name: "Odd" }));
    expect(screen.getByRole("textbox")).toHaveValue("1, 3, 5");
    await user.click(screen.getByRole("button", { name: "Invert" }));
    expect(screen.getByRole("textbox")).toHaveValue("2, 4, 6");
    await user.click(screen.getByRole("button", { name: "None" }));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("updates the grid from typed ranges and shows token errors", async () => {
    const user = userEvent.setup();
    const changes: number[][] = [];
    renderWithIntl(<Harness onChange={(pages) => changes.push(pages)} />);
    await user.type(screen.getByRole("textbox"), "1-2, last");
    expect(option(6)).toHaveAttribute("aria-selected", "true");
    expect(changes.at(-1)).toEqual([0, 1, 5]);
    await user.type(screen.getByRole("textbox"), ", 9");
    expect(screen.getByRole("alert")).toHaveTextContent("“9” is outside this document");
  });

  it("supports keyboard navigation and selection", () => {
    renderWithIntl(<Harness />);
    const grid = screen.getByRole("listbox");
    option(1).focus();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: " " });
    expect(option(2)).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(grid, { key: "a", ctrlKey: true });
    expect(screen.getAllByRole("option", { selected: true })).toHaveLength(6);
  });
});
