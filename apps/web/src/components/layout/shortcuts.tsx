"use client";

import { useTranslations } from "next-intl";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUi } from "@/stores/ui";

export const SHORTCUTS: { id: string; keys: string[] }[] = [
  { id: "palette", keys: ["Ctrl", "K"] },
  { id: "shortcuts", keys: ["?"] },
  { id: "search", keys: ["/"] },
  { id: "theme", keys: ["Shift", "D"] },
  { id: "paste", keys: ["Ctrl", "V"] },
  { id: "close", keys: ["Esc"] },
];

export function ShortcutList() {
  const t = useTranslations("shortcuts.items");
  return (
    <dl className="divide-y divide-border">
      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.id} className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm">{t(shortcut.id)}</dt>
          <dd className="flex gap-1" dir="ltr">
            {shortcut.keys.map((key) => (
              <kbd
                key={key}
                className="min-w-7 rounded-md border border-border-strong bg-surface-muted px-2 py-0.5 text-center font-mono text-xs"
              >
                {key}
              </kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ShortcutsDialog() {
  const t = useTranslations("shortcuts");
  const open = useUi((state) => state.shortcutsOpen);
  const setOpen = useUi((state) => state.setShortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title={t("title")} description={t("subtitle")}>
        <ShortcutList />
      </DialogContent>
    </Dialog>
  );
}
