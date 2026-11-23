"use client";

import { useCallback, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { createTask, getTask, startTask, subscribeToTask } from "@/lib/tasks";
import type { TaskFile } from "@/lib/types";
import { uploadFile } from "@/lib/upload";

export type BatchStatus = "queued" | "uploading" | "processing" | "done" | "failed";

export type BatchItem = {
  key: string;
  file: File;
  status: BatchStatus;
  progress: number;
  label: string;
  error: string | null;
  taskId: string | null;
  outputs: TaskFile[];
};

const CONCURRENCY = 2;
const POLL_MS = 1500;
const POLL_LIMIT = 200;

function newItem(file: File): BatchItem {
  return {
    key: crypto.randomUUID(),
    file,
    status: "queued",
    progress: 0,
    label: "",
    error: null,
    taskId: null,
    outputs: [],
  };
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function waitForTask(taskId: string, onProgress: (fraction: number, label: string) => void) {
  const finished = await new Promise<string | null>((resolve) => {
    const stop = subscribeToTask(taskId, {
      onEvent: (event) => onProgress(event.progress, event.label),
      onDone: (status) => resolve(status),
      onConnectionLost: () => {
        stop();
        resolve(null);
      },
    });
  });
  if (finished) return getTask(taskId);
  for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
    const task = await getTask(taskId);
    if (["succeeded", "failed", "cancelled", "expired"].includes(task.status)) return task;
    onProgress(task.progress, task.progress_label);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error("The task is taking too long.");
}

export function useBatchRunner() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  const patch = useCallback((key: string, changes: Partial<BatchItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }, []);

  const add = useCallback((files: File[]) => {
    setItems((current) => [...current, ...files.map(newItem)]);
  }, []);

  const remove = useCallback((key: string) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const process = useCallback(
    async (item: BatchItem, tool: string, options: Record<string, unknown>) => {
      try {
        patch(item.key, { status: "uploading", progress: 0, error: null, label: "" });
        const task = await createTask(tool, crypto.randomUUID());
        patch(item.key, { taskId: task.id });
        const upload = await uploadFile(task.id, item.file, {
          onProgress: (sent, total) => patch(item.key, { progress: total ? (sent / total) * 0.3 : 0 }),
        });
        patch(item.key, { status: "processing", progress: 0.3 });
        await startTask(task.id, options, [upload.id]);
        const result = await waitForTask(task.id, (fraction, label) =>
          patch(item.key, { progress: 0.3 + fraction * 0.7, label }),
        );
        if (result.status === "succeeded") {
          patch(item.key, { status: "done", progress: 1, outputs: result.outputs, label: "" });
        } else {
          patch(item.key, {
            status: "failed",
            error: result.error_message ?? "The task did not finish.",
          });
        }
      } catch (error) {
        patch(item.key, { status: "failed", error: messageOf(error) });
      }
    },
    [patch],
  );

  const runKeys = useCallback(
    async (keys: string[], tool: string, options: Record<string, unknown>, snapshot: BatchItem[]) => {
      cancelled.current = false;
      setRunning(true);
      const queue = snapshot.filter((item) => keys.includes(item.key));
      const worker = async () => {
        for (;;) {
          if (cancelled.current) return;
          const next = queue.shift();
          if (!next) return;
          await process(next, tool, options);
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      setRunning(false);
    },
    [process],
  );

  const start = (tool: string, options: Record<string, unknown>) =>
    runKeys(
      items.filter((item) => item.status === "queued" || item.status === "failed").map((item) => item.key),
      tool,
      options,
      items,
    );

  const retryFailed = (tool: string, options: Record<string, unknown>) =>
    runKeys(
      items.filter((item) => item.status === "failed").map((item) => item.key),
      tool,
      options,
      items,
    );

  const retryOne = (key: string, tool: string, options: Record<string, unknown>) =>
    runKeys([key], tool, options, items);

  const stop = useCallback(() => {
    cancelled.current = true;
  }, []);

  return { items, running, add, remove, clear, start, retryFailed, retryOne, stop };
}

export async function zipOutputs(items: BatchItem[]): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  for (const item of items) {
    if (item.status !== "done") continue;
    const folder = item.file.name.replace(/\.[^.]+$/, "").replace(/[\\/]/g, "_") || "file";
    for (const output of item.outputs) {
      if (!output.download_url) continue;
      const response = await fetch(output.download_url, { credentials: "include" });
      if (!response.ok) continue;
      let name = `${folder}/${output.filename}`;
      let counter = 1;
      while (name in files) {
        counter += 1;
        name = `${folder}-${counter}/${output.filename}`;
      }
      files[name] = new Uint8Array(await response.arrayBuffer());
    }
  }
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], {
    type: "application/zip",
  });
}
