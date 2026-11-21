"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { useUi } from "@/stores/ui";

const CommandPalette = dynamic(
  () => import("@/components/layout/command-palette").then((module) => module.CommandPalette),
  { ssr: false },
);
const ShortcutsDialog = dynamic(
  () => import("@/components/layout/shortcuts").then((module) => module.ShortcutsDialog),
  { ssr: false },
);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function useGlobalShortcuts() {
  const setPaletteOpen = useUi((state) => state.setPaletteOpen);
  const setShortcutsOpen = useUi((state) => state.setShortcutsOpen);
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(!useUi.getState().paletteOpen);
        return;
      }
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (event.key === "D" && event.shiftKey) {
        event.preventDefault();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      } else if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>("[data-tool-search]");
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolvedTheme, setPaletteOpen, setShortcutsOpen, setTheme]);
}

export function GlobalOverlays() {
  useGlobalShortcuts();
  const paletteOpen = useUi((state) => state.paletteOpen);
  const shortcutsOpen = useUi((state) => state.shortcutsOpen);
  const [paletteUsed, setPaletteUsed] = useState(false);
  const [shortcutsUsed, setShortcutsUsed] = useState(false);
  if (paletteOpen && !paletteUsed) setPaletteUsed(true);
  if (shortcutsOpen && !shortcutsUsed) setShortcutsUsed(true);
  return (
    <>
      {paletteUsed ? <CommandPalette /> : null}
      {shortcutsUsed ? <ShortcutsDialog /> : null}
    </>
  );
}
