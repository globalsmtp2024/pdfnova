"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  cancelTask,
  chainOutput,
  createTask,
  deleteTask,
  getTask,
  importFromUrl,
  inspectFile,
  removeUpload,
  startTask,
  subscribeToTask,
} from "@/lib/tasks";
import type { Task, TaskEvent } from "@/lib/types";
import { uploadFile } from "@/lib/upload";

export type LocalFileStatus = "queued" | "uploading" | "ready" | "error";

export type LocalFile = {
  key: string;
  file: File | null;
  name: string;
  size: number;
  status: LocalFileStatus;
  uploaded: number;
  uploadId: string | null;
  pageCount: number | null;
  encrypted: boolean;
  password: string;
  unlocked: boolean;
  error: string | null;
};

export type Phase = "select" | "processing" | "done" | "failed";

function newKey(): string {
  return crypto.randomUUID();
}

function asApiError(failure: unknown, fallback: string): ApiError {
  return failure instanceof ApiError
    ? failure
    : new ApiError(0, { code: "unknown", message: fallback, hint: null, details: {} });
}

export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function useToolSession(tool: string) {
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [phase, setPhase] = useState<Phase>("select");
  const [task, setTask] = useState<Task | null>(null);
  const [event, setEvent] = useState<TaskEvent | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [starting, setStarting] = useState(false);
  const [importing, setImporting] = useState(false);
  const taskRef = useRef<Task | null>(null);
  const taskPromise = useRef<Promise<Task> | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const unsubscribe = useRef<(() => void) | null>(null);

  const patch = useCallback((key: string, update: Partial<LocalFile>) => {
    setFiles((current) =>
      current.map((item) => (item.key === key ? { ...item, ...update } : item)),
    );
  }, []);

  const ensureTask = useCallback(async (): Promise<Task> => {
    if (taskRef.current) return taskRef.current;
    taskPromise.current ??= createTask(tool, crypto.randomUUID()).then((created) => {
      taskRef.current = created;
      setTask(created);
      return created;
    });
    try {
      return await taskPromise.current;
    } catch (failure) {
      taskPromise.current = null;
      throw failure;
    }
  }, [tool]);

  const uploadOne = useCallback(
    async (item: LocalFile) => {
      if (!item.file) return;
      const file = item.file;
      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      patch(item.key, { status: "uploading", error: null, uploaded: 0 });
      try {
        const current = await ensureTask();
        const upload = await uploadFile(current.id, file, {
          signal: controller.signal,
          onProgress: (uploaded) => patch(item.key, { uploaded }),
        });
        patch(item.key, {
          status: "ready",
          uploadId: upload.id,
          uploaded: file.size,
          pageCount: upload.page_count,
          encrypted: upload.encrypted,
        });
      } catch (failure) {
        if (controller.signal.aborted) return;
        patch(item.key, { status: "error", error: asApiError(failure, "Upload failed.").message });
      } finally {
        controllers.current.delete(item.key);
      }
    },
    [ensureTask, patch],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      const items: LocalFile[] = incoming.map((file) => ({
        key: newKey(),
        file,
        name: file.name,
        size: file.size,
        status: "queued",
        uploaded: 0,
        uploadId: null,
        pageCount: null,
        encrypted: false,
        password: "",
        unlocked: false,
        error: null,
      }));
      setFiles((current) => [...current, ...items]);
      for (const item of items) {
        queue.current = queue.current.then(() => uploadOne(item));
      }
    },
    [uploadOne],
  );

  const importUrl = useCallback(
    async (url: string) => {
      setImporting(true);
      try {
        const current = await ensureTask();
        const upload = await importFromUrl(current.id, url);
        setFiles((existing) => [
          ...existing,
          {
            key: newKey(),
            file: null,
            name: upload.filename,
            size: upload.size,
            status: "ready",
            uploaded: upload.size,
            uploadId: upload.id,
            pageCount: upload.page_count,
            encrypted: upload.encrypted,
            password: "",
            unlocked: false,
            error: null,
          },
        ]);
      } finally {
        setImporting(false);
      }
    },
    [ensureTask],
  );

  const addChained = useCallback(
    async (outputs: { fileId: string; name: string }[]) => {
      const keys = outputs.map(() => newKey());
      setFiles((existing) => [
        ...existing,
        ...outputs.map((output, index) => ({
          key: keys[index],
          file: null,
          name: output.name,
          size: 0,
          status: "uploading" as const,
          uploaded: 0,
          uploadId: null,
          pageCount: null,
          encrypted: false,
          password: "",
          unlocked: false,
          error: null,
        })),
      ]);
      const current = await ensureTask();
      for (const [index, output] of outputs.entries()) {
        try {
          const upload = await chainOutput(current.id, output.fileId);
          patch(keys[index], {
            status: "ready",
            size: upload.size,
            uploaded: upload.size,
            uploadId: upload.id,
            pageCount: upload.page_count,
            encrypted: upload.encrypted,
          });
        } catch (failure) {
          patch(keys[index], {
            status: "error",
            error: asApiError(failure, "This result could not be reused.").message,
          });
        }
      }
    },
    [ensureTask, patch],
  );

  const retryFile = useCallback(
    (key: string) => {
      const item = files.find((entry) => entry.key === key);
      if (item) queue.current = queue.current.then(() => uploadOne(item));
    },
    [files, uploadOne],
  );

  const removeFile = useCallback(
    async (key: string) => {
      const item = files.find((entry) => entry.key === key);
      controllers.current.get(key)?.abort();
      setFiles((current) => current.filter((entry) => entry.key !== key));
      if (item?.uploadId) {
        try {
          await removeUpload(item.uploadId);
        } catch {
          return;
        }
      }
    },
    [files],
  );

  const unlockFile = useCallback(
    async (key: string, password: string) => {
      const item = files.find((entry) => entry.key === key);
      if (!item?.uploadId) return;
      const inspection = await inspectFile(item.uploadId, password);
      patch(key, { password, unlocked: true, pageCount: inspection.page_count });
    },
    [files, patch],
  );

  const moveFile = useCallback((key: string, direction: -1 | 1) => {
    setFiles((current) => {
      const index = current.findIndex((entry) => entry.key === key);
      return arrayMove(current, index, index + direction);
    });
  }, []);

  const reorder = useCallback((activeKey: string, overKey: string) => {
    setFiles((current) =>
      arrayMove(
        current,
        current.findIndex((entry) => entry.key === activeKey),
        current.findIndex((entry) => entry.key === overKey),
      ),
    );
  }, []);

  const follow = useCallback((taskId: string) => {
    const finish = (finished: Task) => {
      taskRef.current = finished;
      setTask(finished);
      setPhase(finished.status === "succeeded" ? "done" : "failed");
      if (finished.status !== "succeeded") {
        setError(
          new ApiError(0, {
            code: finished.error_code ?? "failed",
            message: finished.error_message ?? "Processing did not finish.",
            hint:
              finished.status === "cancelled"
                ? null
                : "Check your files and options, then try again.",
            details: {},
          }),
        );
      }
    };
    const connect = () => {
      unsubscribe.current?.();
      unsubscribe.current = subscribeToTask(taskId, {
        onEvent: (incoming) => setEvent(incoming),
        onDone: async () => finish(await getTask(taskId)),
        onConnectionLost: async () => {
          try {
            const latest = await getTask(taskId);
            if (["succeeded", "failed", "cancelled", "expired"].includes(latest.status))
              finish(latest);
            else setTimeout(connect, 1000);
          } catch (failure) {
            setError(asApiError(failure, "We lost track of this task."));
            setPhase("failed");
          }
        },
      });
    };
    connect();
  }, []);

  const start = useCallback(
    async (options: Record<string, unknown>) => {
      const current = taskRef.current;
      if (!current) return;
      setStarting(true);
      setError(null);
      try {
        const order = files
          .map((entry) => entry.uploadId)
          .filter((id): id is string => id !== null);
        const passwords = Object.fromEntries(
          files
            .filter((entry) => entry.encrypted && entry.uploadId && entry.password)
            .map((entry) => [entry.uploadId as string, entry.password]),
        );
        const started = await startTask(current.id, options, order, passwords);
        setFiles((existing) => existing.map((entry) => ({ ...entry, password: "" })));
        taskRef.current = started;
        setTask(started);
        setEvent({
          status: started.status,
          progress: started.progress,
          label: started.progress_label,
          error_code: null,
          error_message: null,
        });
        setPhase("processing");
        follow(started.id);
      } catch (failure) {
        setError(asApiError(failure, "This task could not start."));
        throw failure;
      } finally {
        setStarting(false);
      }
    },
    [files, follow],
  );

  const cancel = useCallback(async () => {
    if (taskRef.current) await cancelTask(taskRef.current.id);
  }, []);

  const deleteNow = useCallback(async () => {
    if (!taskRef.current) return;
    await deleteTask(taskRef.current.id);
    const latest = await getTask(taskRef.current.id);
    taskRef.current = latest;
    setTask(latest);
  }, []);

  const reset = useCallback(
    (keepFiles: boolean) => {
      unsubscribe.current?.();
      unsubscribe.current = null;
      taskRef.current = null;
      taskPromise.current = null;
      setTask(null);
      setEvent(null);
      setError(null);
      setPhase("select");
      const previous = keepFiles
        ? files.map((entry) => entry.file).filter((file): file is File => file !== null)
        : [];
      setFiles([]);
      if (previous.length) addFiles(previous);
    },
    [addFiles, files],
  );

  useEffect(
    () => () => {
      unsubscribe.current?.();
      for (const controller of controllers.current.values()) controller.abort();
    },
    [],
  );

  const allReady =
    files.length > 0 &&
    files.every((entry) => entry.status === "ready" && (!entry.encrypted || entry.unlocked));
  const locked = files.some(
    (entry) => entry.status === "ready" && entry.encrypted && !entry.unlocked,
  );
  const uploading = files.some(
    (entry) => entry.status === "uploading" || entry.status === "queued",
  );
  const readyCount = files.filter((entry) => entry.status === "ready").length;

  useEffect(() => {
    const current = taskRef.current;
    if (!allReady || phase !== "select" || !current) return;
    let active = true;
    getTask(current.id)
      .then((latest) => {
        if (active && latest.status === "created") {
          taskRef.current = latest;
          setTask(latest);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [allReady, phase, readyCount]);

  return {
    files,
    phase,
    task,
    event,
    error,
    starting,
    importing,
    allReady,
    locked,
    uploading,
    unlockFile,
    addFiles,
    addChained,
    importUrl,
    retryFile,
    removeFile,
    moveFile,
    reorder,
    start,
    cancel,
    deleteNow,
    reset,
  };
}
