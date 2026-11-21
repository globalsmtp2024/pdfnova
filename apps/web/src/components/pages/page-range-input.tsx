"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatPageSet, parsePageExpression } from "@/lib/page-expression";

export function PageRangeInput({
  pageCount,
  selected,
  onSelectedChange,
  label,
}: {
  pageCount: number;
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
  label?: string;
}) {
  const t = useTranslations("pageGrid");
  const id = useId();
  const [text, setText] = useState(() => formatPageSet(selected));
  const [error, setError] = useState<string | null>(null);
  const formatted = formatPageSet(selected);
  const [synced, setSynced] = useState(formatted);

  if (synced !== formatted) {
    setSynced(formatted);
    const current = parsePageExpression(text, pageCount);
    const matches =
      current.ok && current.pages.length > 0 && formatPageSet(current.pages) === formatted;
    if (!matches && !(text.trim() === "" && selected.size === 0)) {
      setText(formatted);
      setError(null);
    }
  }

  const onChange = (value: string) => {
    setText(value);
    if (!value.trim()) {
      setError(null);
      onSelectedChange(new Set());
      return;
    }
    const result = parsePageExpression(value, pageCount);
    if (result.ok) {
      setError(null);
      onSelectedChange(new Set(result.pages));
    } else {
      setError(t(`errors.${result.reason}`, { token: result.token, count: pageCount }));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label ?? t("rangeLabel")}
      </label>
      <Input
        id={id}
        dir="ltr"
        value={text}
        placeholder={t("rangePlaceholder", { count: pageCount })}
        aria-invalid={error !== null}
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(event.target.value)}
        data-page-range
      />
      <p
        id={`${id}-help`}
        className={error ? "text-xs text-danger-strong" : "text-xs text-muted"}
        role={error ? "alert" : undefined}
      >
        {error ?? t("rangeHelp")}
      </p>
    </div>
  );
}
