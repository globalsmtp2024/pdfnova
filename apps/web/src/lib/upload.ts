import { ApiError, apiFetch, apiJson, NETWORK_ERROR, parseError, readCookie } from "@/lib/api";
import type { Upload } from "@/lib/types";
import { sleep } from "@/lib/utils";

export type ChunkRequest = {
  uploadId: string;
  offset: number;
  chunk: Blob;
  signal?: AbortSignal;
  onChunkProgress: (sentBytes: number) => void;
};

export type ChunkSender = (request: ChunkRequest) => Promise<Upload>;
export type OffsetReader = (uploadId: string, signal?: AbortSignal) => Promise<number>;

export type UploadOptions = {
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
  maxRetries?: number;
  retryBaseMs?: number;
  sendChunk?: ChunkSender;
  readOffset?: OffsetReader;
};

export const xhrChunkSender: ChunkSender = ({ uploadId, offset, chunk, signal, onChunkProgress }) =>
  new Promise<Upload>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PATCH", `/api/v1/uploads/${uploadId}`);
    request.withCredentials = true;
    request.setRequestHeader("Upload-Offset", String(offset));
    request.setRequestHeader("Content-Type", "application/offset+octet-stream");
    const csrf = readCookie("pn_csrf");
    if (csrf) request.setRequestHeader("X-CSRF-Token", csrf);
    request.upload.onprogress = (event) => onChunkProgress(event.loaded);
    request.onload = async () => {
      const response = new Response(request.responseText, {
        status: request.status,
        headers: { "Content-Type": "application/json" },
      });
      if (request.status >= 200 && request.status < 300) {
        resolve((await response.json()) as Upload);
      } else {
        reject(await parseError(response));
      }
    };
    request.onerror = () => reject(new ApiError(0, NETWORK_ERROR));
    request.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(chunk);
  });

export const headOffsetReader: OffsetReader = async (uploadId, signal) => {
  const response = await apiFetch(`/api/v1/uploads/${uploadId}`, { method: "HEAD", signal });
  return Number(response.headers.get("Upload-Offset") ?? "0");
};

function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError)
    return error.status === 0 || error.status >= 500 || error.status === 409;
  return false;
}

export async function createUpload(
  taskId: string,
  file: File,
  signal?: AbortSignal,
): Promise<Upload> {
  return apiJson<Upload>(`/api/v1/tasks/${taskId}/uploads`, {
    method: "POST",
    json: { filename: file.name, size: file.size },
    signal,
  });
}

export async function uploadFile(
  taskId: string,
  file: File,
  options: UploadOptions = {},
): Promise<Upload> {
  const created = await createUpload(taskId, file, options.signal);
  return resumeUpload(created, file, options);
}

export async function resumeUpload(
  upload: Upload,
  file: File,
  options: UploadOptions = {},
): Promise<Upload> {
  const sendChunk = options.sendChunk ?? xhrChunkSender;
  const readOffset = options.readOffset ?? headOffsetReader;
  const maxRetries = options.maxRetries ?? 5;
  const retryBaseMs = options.retryBaseMs ?? 500;
  let current = upload;
  let offset = upload.offset;
  let failures = 0;
  options.onProgress?.(offset, file.size);
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + current.chunk_size);
    try {
      current = await sendChunk({
        uploadId: current.id,
        offset,
        chunk,
        signal: options.signal,
        onChunkProgress: (sent) => options.onProgress?.(offset + sent, file.size),
      });
      offset = current.offset;
      failures = 0;
      options.onProgress?.(offset, file.size);
    } catch (error) {
      if (!isRetryable(error) || failures >= maxRetries || options.signal?.aborted) throw error;
      failures += 1;
      await sleep(retryBaseMs * 2 ** (failures - 1), options.signal);
      offset = await readOffset(current.id, options.signal);
    }
  }
  return current;
}
