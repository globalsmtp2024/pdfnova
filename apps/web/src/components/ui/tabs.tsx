"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TabData = { id: string; label: ReactNode; content: ReactNode };

export function Tabs({
  tabs,
  label,
  className,
  listClassName,
  defaultValue,
}: {
  tabs: TabData[];
  label: string;
  className?: string;
  listClassName?: string;
  defaultValue?: string;
}) {
  return (
    <TabsPrimitive.Root
      defaultValue={defaultValue ?? tabs[0]?.id}
      className={cn("flex flex-col gap-4", className)}
    >
      <TabsPrimitive.List
        aria-label={label}
        className={cn(
          "inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1",
          listClassName,
        )}
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.id}
            value={tab.id}
            className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground data-[state=active]:bg-foreground data-[state=active]:text-background"
          >
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((tab) => (
        <TabsPrimitive.Content
          key={tab.id}
          value={tab.id}
          className="focus-visible:outline-offset-4"
        >
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
