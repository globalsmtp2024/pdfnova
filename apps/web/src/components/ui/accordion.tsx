"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AccordionItemData = { id: string; question: ReactNode; answer: ReactNode };

export function Accordion({
  items,
  className,
}: {
  items: AccordionItemData[];
  className?: string;
}) {
  return (
    <AccordionPrimitive.Root
      type="multiple"
      className={cn(
        "divide-y divide-border rounded-(--radius-card) border border-border bg-surface",
        className,
      )}
    >
      {items.map((entry) => (
        <AccordionPrimitive.Item key={entry.id} value={entry.id} className="group">
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start font-medium transition-colors hover:bg-surface-muted/60 focus-visible:outline-offset-[-2px]">
              {entry.question}
              <Plus
                aria-hidden
                className="size-4 shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-45"
              />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="overflow-hidden px-5 text-muted data-[state=closed]:hidden">
            <div className="pb-5">{entry.answer}</div>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
