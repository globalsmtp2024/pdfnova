import { create } from "zustand";

export type ChainedOutput = { fileId: string; name: string };

type PendingFilesState = {
  files: File[];
  chained: ChainedOutput[];
  setFiles: (files: File[]) => void;
  setChained: (outputs: ChainedOutput[]) => void;
  take: () => File[];
  takeChained: () => ChainedOutput[];
};

export const usePendingFiles = create<PendingFilesState>((set, get) => ({
  files: [],
  chained: [],
  setFiles: (files) => set({ files }),
  setChained: (chained) => set({ chained }),
  take: () => {
    const files = get().files;
    set({ files: [] });
    return files;
  },
  takeChained: () => {
    const chained = get().chained;
    set({ chained: [] });
    return chained;
  },
}));
