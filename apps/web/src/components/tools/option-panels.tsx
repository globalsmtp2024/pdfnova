"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl p-3 hover:bg-surface-muted">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 accent-(--primary)"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label
        htmlFor={id}
        className="flex flex-1 cursor-pointer items-center gap-1.5 text-sm font-medium"
      >
        {label}
      </label>
      <Tooltip content={description}>
        <button
          type="button"
          className="rounded-md p-0.5 text-muted hover:text-foreground"
          aria-label={typeof description === "string" ? description : label}
        >
          <Info className="size-4" aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}
