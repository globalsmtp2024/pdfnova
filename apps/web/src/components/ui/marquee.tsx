import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Marquee({
  items,
  className,
  durationSeconds = 40,
  label,
}: {
  items: ReactNode[];
  className?: string;
  durationSeconds?: number;
  label: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className={cn("group relative overflow-hidden mask-fade-x", className)}
      style={{ ["--marquee-duration" as string]: `${durationSeconds}s` }}
    >
      <ul className="sr-only">
        {items.map((itemContent, index) => (
          <li key={index}>{itemContent}</li>
        ))}
      </ul>
      <div
        aria-hidden
        className="flex w-max animate-marquee gap-3 group-hover:[animation-play-state:paused]"
      >
        {[...items, ...items].map((itemContent, index) => (
          <div key={index} className="shrink-0">
            {itemContent}
          </div>
        ))}
      </div>
    </div>
  );
}
