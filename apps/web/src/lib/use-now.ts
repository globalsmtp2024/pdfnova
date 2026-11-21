"use client";

import { useSyncExternalStore } from "react";

let current = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  current = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    current = Date.now();
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function snapshot() {
  if (current === 0) current = Date.now();
  return current;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
