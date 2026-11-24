"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import { TD, TH } from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;
  className?: string;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  pageSize = 10,
  empty,
  toolbar,
  minWidth = "44rem",
  initialSort = null,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  empty: ReactNode;
  toolbar?: ReactNode;
  minWidth?: string;
  initialSort?: SortState;
}) {
  const t = useTranslations("adminPanel.table");
  const format = useFormatter();
  const [sort, setSort] = useState<SortState>(initialSort);
  const [size, setSize] = useState(pageSize);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const column = columns.find((entry) => entry.key === sort?.key);
    if (!column?.sortValue || !sort) return rows;
    const pick = column.sortValue;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = pick(a);
      const right = pick(b);
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [columns, rows, sort]);

  const pages = Math.max(Math.ceil(sorted.length / size), 1);
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * size, current * size + size);
  const from = sorted.length ? current * size + 1 : 0;
  const to = Math.min(current * size + size, sorted.length);

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((previous) => {
      if (previous?.key !== key) return { key, dir: "asc" };
      return previous.dir === "asc" ? { key, dir: "desc" } : null;
    });
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-soft">
      {toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
          {toolbar}
        </div>
      ) : null}
      <div className="max-h-[38rem] overflow-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead className="sticky top-0 z-10 bg-surface-muted">
            <tr>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={cn(TH, "whitespace-nowrap", column.className)}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                      >
                        {column.header}
                        <span
                          aria-hidden
                          className={cn("text-[10px]", active ? "text-primary" : "opacity-40")}
                        >
                          {active ? (sort?.dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                  {empty}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter" && event.target === event.currentTarget) {
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    "transition-colors even:bg-surface-muted/30 hover:bg-primary-subtle/50 focus-visible:bg-primary-subtle/60 focus-visible:outline-none",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={cn(TD, column.className)}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/40 px-4 py-2.5 text-xs text-muted">
        <span>
          {t("showing", {
            from: format.number(from),
            to: format.number(to),
            total: format.number(sorted.length),
          })}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            {t("rows")}
            <select
              value={size}
              onChange={(event) => {
                setSize(Number(event.target.value));
                setPage(0);
              }}
              className="h-8 rounded-md border border-border-strong bg-surface px-2 text-foreground"
            >
              {[10, 25, 50, 100].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <span className="tabular-nums">{t("page", { current: current + 1, pages })}</span>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label={t("previous")}
              title={t("previous")}
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              className="flex size-8 items-center justify-center rounded-md border border-border-strong bg-surface text-foreground hover:bg-surface-muted disabled:opacity-40"
            >
              <ChevronLeft className="flip-rtl size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("next")}
              title={t("next")}
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
              className="flex size-8 items-center justify-center rounded-md border border-border-strong bg-surface text-foreground hover:bg-surface-muted disabled:opacity-40"
            >
              <ChevronRight className="flip-rtl size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
