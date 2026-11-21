"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { Tooltip } from "@/components/ui/tooltip";

export type DayCount = { date: string; tasks: number };

export function ApiActivityChart({ days, title }: { days: DayCount[]; title: string }) {
  const locale = useLocale();
  const [showTable, setShowTable] = useState(false);
  const max = Math.max(1, ...days.map((day) => day.tasks));
  const total = days.reduce((sum, day) => sum + day.tasks, 0);
  const format = (date: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00Z`),
    );
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="font-display text-2xl font-bold tabular-nums">
          {total.toLocaleString(locale)}
        </span>
      </figcaption>
      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 text-start font-medium">
                Date
              </th>
              <th scope="col" className="py-1 text-end font-medium">
                Tasks
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date} className="border-t border-border">
                <td className="py-1">{format(day.date)}</td>
                <td className="py-1 text-end tabular-nums">{day.tasks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col gap-1">
          <div
            role="img"
            aria-label={`${title}: ${total} tasks in ${days.length} days`}
            className="flex h-28 items-end gap-[2px] border-b border-border"
            dir="ltr"
          >
            {days.map((day) => (
              <Tooltip key={day.date} content={`${format(day.date)}: ${day.tasks}`}>
                <button
                  type="button"
                  aria-label={`${format(day.date)}: ${day.tasks}`}
                  className="group flex h-full flex-1 items-end focus-visible:outline-offset-1"
                >
                  <span
                    className="block w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                    style={{
                      height: day.tasks ? `${Math.max((day.tasks / max) * 100, 4)}%` : "0%",
                    }}
                  />
                </button>
              </Tooltip>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted" dir="ltr">
            <span>{days[0] ? format(days[0].date) : ""}</span>
            <span>{days.at(-1) ? format(days.at(-1)!.date) : ""}</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowTable((value) => !value)}
        className="w-fit text-xs font-medium text-primary hover:underline"
      >
        {showTable ? "Show chart" : "Show as table"}
      </button>
    </figure>
  );
}
