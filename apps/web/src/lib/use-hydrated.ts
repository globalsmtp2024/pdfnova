"use client";

import { useSyncExternalStore } from "react";

function subscribeToNothing(): () => void {
  return () => undefined;
}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}
