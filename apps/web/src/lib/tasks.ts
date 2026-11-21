import { apiFetch, apiJson } from "@/lib/api";
import type { Task, TaskEvent, Upload } from "@/lib/types";

export function createTask(tool: string, idempotencyKey: string): Promise<Task> {
  return apiJson<Task>("/api/v1/tasks", {
    method: "POST",
    json: { tool },
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function startTask(
  taskId: string,
  options: Record<string, unknown>,
  fileOrder: string[],
  passwords: Record<string, string> = {},
): Promise<Task> {
  return apiJson<Task>(`/api/v1/tasks/${taskId}/start`, {
    method: "POST",
    json: { options, file_order: fileOrder, passwords },
  });
}

export function inspectFile(
  fileId: string,
  password?: string,
): Promise<{ page_count: number; encrypted: boolean }> {
  return apiJson(`/api/v1/files/${fileId}/inspect`, {
    method: "POST",
    json: password ? { password } : {},
  });
}

export function getTask(taskId: string): Promise<Task> {
  return apiJson<Task>(`/api/v1/tasks/${taskId}`);
}

export function cancelTask(taskId: string): Promise<Task> {
  return apiJson<Task>(`/api/v1/tasks/${taskId}/cancel`, { method: "POST" });
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiFetch(`/api/v1/tasks/${taskId}`, { method: "DELETE" });
}

export async function removeUpload(uploadId: string): Promise<void> {
  await apiFetch(`/api/v1/uploads/${uploadId}`, { method: "DELETE" });
}

export type TaskEventHandlers = {
  onEvent: (event: TaskEvent) => void;
  onDone: (status: string) => void;
  onConnectionLost: () => void;
};

export function subscribeToTask(taskId: string, handlers: TaskEventHandlers): () => void {
  const source = new EventSource(`/api/v1/tasks/${taskId}/events`, { withCredentials: true });
  let finished = false;
  source.addEventListener("progress", (message) => {
    handlers.onEvent(JSON.parse((message as MessageEvent<string>).data) as TaskEvent);
  });
  source.addEventListener("done", (message) => {
    finished = true;
    source.close();
    const payload = JSON.parse((message as MessageEvent<string>).data) as { status: string };
    handlers.onDone(payload.status);
  });
  source.addEventListener("gone", () => {
    finished = true;
    source.close();
    handlers.onConnectionLost();
  });
  source.onerror = () => {
    if (!finished && source.readyState === EventSource.CLOSED) handlers.onConnectionLost();
  };
  return () => {
    finished = true;
    source.close();
  };
}

export function importFromUrl(taskId: string, url: string): Promise<Upload> {
  return apiJson<Upload>(`/api/v1/tasks/${taskId}/imports`, { method: "POST", json: { url } });
}

export function chainOutput(taskId: string, outputFileId: string): Promise<Upload> {
  return apiJson<Upload>(`/api/v1/tasks/${taskId}/chain`, {
    method: "POST",
    json: { output_file_id: outputFileId },
  });
}
