"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster, toast } from "sonner";

import { ApiError } from "@/lib/api";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: "rounded-(--radius-card)! border-border! shadow-lifted! font-sans!",
          description: "text-muted!",
        },
      }}
    />
  );
}

const FALLBACK_ERROR = "Something went wrong.";

export function toastError(error: unknown) {
  const fallback = FALLBACK_ERROR;
  if (error instanceof ApiError) {
    toast.error(error.message, { description: error.hint ?? undefined });
    return;
  }
  if (error instanceof DOMException && error.name === "AbortError") return;
  toast.error(fallback, { description: "Please try again." });
}

export { toast };
