import { create } from "zustand";

type UiState = {
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
};

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));
