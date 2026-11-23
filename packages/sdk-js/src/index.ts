import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export class PDFNovaError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = "",
    readonly hint: string | null = null,
  ) {
    super(message);
  }
}

export type TaskOutput = { id: string; filename: string; size: number; download_url: string | null };
export type Task = {
  id: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  outputs: TaskOutput[];
};

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "expired"]);

export class Client {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl = "https://api.pdfnova.app",
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      let error: { message?: string; code?: string; hint?: string | null } = {};
      try {
        error = ((await response.json()) as { error?: typeof error }).error ?? {};
      } catch {
        error = {};
      }
      throw new PDFNovaError(
        error.message ?? `The server answered ${response.status}.`,
        response.status,
        error.code ?? "",
        error.hint ?? null,
      );
    }
    return (await response.json()) as T;
  }

  tools(): Promise<{ slug: string; name: string; summary: string }[]> {
    return this.request("/api/v1/tools");
  }

  createTask(tool: string): Promise<Task> {
    return this.request("/api/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool }),
    });
  }

  async upload(taskId: string, path: string): Promise<void> {
    const form = new FormData();
    form.append("file", new Blob([await readFile(path)]), basename(path));
    await this.request(`/api/v1/tasks/${taskId}/files`, { method: "POST", body: form });
  }

  start(taskId: string, options: Record<string, unknown> = {}): Promise<Task> {
    return this.request(`/api/v1/tasks/${taskId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ options }),
    });
  }

  task(taskId: string): Promise<Task> {
    return this.request(`/api/v1/tasks/${taskId}`);
  }

  async wait(taskId: string, timeoutMs = 600_000, intervalMs = 1000): Promise<Task> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const current = await this.task(taskId);
      if (TERMINAL.has(current.status)) {
        if (current.status !== "succeeded") {
          throw new PDFNovaError(
            current.error_message ?? `The task ${current.status}.`,
            0,
            current.error_code ?? "",
          );
        }
        return current;
      }
      if (Date.now() > deadline) throw new PDFNovaError("The task took too long.", 0, "timeout");
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async download(output: TaskOutput): Promise<Uint8Array> {
    if (!output.download_url) throw new PDFNovaError("This output has no download link.");
    const response = await fetch(`${this.baseUrl}${output.download_url}`);
    if (!response.ok) throw new PDFNovaError(`Download failed with ${response.status}.`, response.status);
    return new Uint8Array(await response.arrayBuffer());
  }

  async run(tool: string, files: string[], options: Record<string, unknown> = {}) {
    const task = await this.createTask(tool);
    for (const file of files) await this.upload(task.id, file);
    await this.start(task.id, options);
    const finished = await this.wait(task.id);
    return Promise.all(
      finished.outputs
        .filter((output) => output.download_url)
        .map(async (output) => ({ filename: output.filename, data: await this.download(output) })),
    );
  }
}

export function verifyWebhook(
  secret: string,
  header: string,
  body: string | Uint8Array,
  toleranceSeconds = 300,
  now = Date.now() / 1000,
): boolean {
  const fields = Object.fromEntries(header.split(",").map((part) => part.split("=") as [string, string]));
  const timestamp = Number(fields.t);
  if (!Number.isFinite(timestamp) || !fields.v1 || Math.abs(now - timestamp) > toleranceSeconds) return false;
  const payload = Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(body)]);
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(fields.v1, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
