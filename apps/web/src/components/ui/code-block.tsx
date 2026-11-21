"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type CodeSample = { id: string; label: string; code: string };

export function CopyButton({
  text,
  label = "Copy code",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[#c9cde0] transition-colors hover:bg-white/10 hover:text-white",
        className,
      )}
      aria-label={copied ? "Copied" : label}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function CodeBlock({
  samples,
  title,
  className,
}: {
  samples: CodeSample[];
  title?: string;
  className?: string;
}) {
  const [active, setActive] = useState(samples[0]?.id ?? "");
  const current = samples.find((sample) => sample.id === active) ?? samples[0];
  if (!current) return null;
  return (
    <div
      dir="ltr"
      className={cn(
        "overflow-hidden rounded-(--radius-card) border border-white/10 bg-[#0b0d17] text-start shadow-floating",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        {samples.length > 1 ? (
          <div role="tablist" aria-label={title ?? "Code language"} className="flex gap-1">
            {samples.map((sample) => (
              <button
                key={sample.id}
                type="button"
                role="tab"
                aria-selected={sample.id === current.id}
                onClick={() => setActive(sample.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
                  sample.id === current.id
                    ? "bg-white/12 text-white"
                    : "text-[#9aa0b8] hover:text-white",
                )}
              >
                {sample.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="font-mono text-xs text-[#9aa0b8]">{title ?? current.label}</span>
        )}
        <CopyButton text={current.code} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-[#e6e8f0]">
        <code>{current.code}</code>
      </pre>
    </div>
  );
}
