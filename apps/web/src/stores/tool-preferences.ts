import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

const MAX_RECENT = 8;

const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      return;
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      return;
    }
  },
};

type ToolPreferences = {
  favorites: string[];
  recent: string[];
  toggleFavorite: (slug: string) => void;
  recordUse: (slug: string) => void;
};

export const useToolPreferences = create<ToolPreferences>()(
  persist(
    (set) => ({
      favorites: [],
      recent: [],
      toggleFavorite: (slug) =>
        set((state) => ({
          favorites: state.favorites.includes(slug)
            ? state.favorites.filter((entry) => entry !== slug)
            : [...state.favorites, slug],
        })),
      recordUse: (slug) =>
        set((state) => ({
          recent: [slug, ...state.recent.filter((entry) => entry !== slug)].slice(0, MAX_RECENT),
        })),
    }),
    {
      name: "tool-preferences",
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
    },
  ),
);
