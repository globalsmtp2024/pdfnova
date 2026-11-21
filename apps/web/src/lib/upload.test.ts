import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import type { Upload } from "@/lib/types";
import { resumeUpload, type ChunkRequest } from "@/lib/upload";

function makeUpload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: "u1",
    task_id: "t1",
    filename: "a.pdf",
    size: 25,
    offset: 0,
    chunk_size: 10,
    status: "uploading",
    kind: null,
    page_count: null,
    encrypted: false,
    rejection_reason: null,
    ...overrides,
  };
}

function serverMock(file: File, failures: Record<number, ApiError> = {}) {
  let received = 0;
  const calls: number[] = [];
  const sendChunk = vi.fn(async (request: ChunkRequest): Promise<Upload> => {
    calls.push(request.offset);
    const failure = failures[calls.length];
    if (failure) throw failure;
    expect(request.offset).toBe(received);
    request.onChunkProgress(request.chunk.size / 2);
    received += request.chunk.size;
    const done = received === file.size;
    return makeUpload({
      offset: received,
      status: done ? "ready" : "uploading",
      page_count: done ? 3 : null,
    });
  });
  const readOffset = vi.fn(async () => received);
  return { sendChunk, readOffset, calls };
}

describe("resumeUpload", () => {
  it("sends sequential chunks and reports progress", async () => {
    const file = new File(["x".repeat(25)], "a.pdf", { type: "application/pdf" });
    const server = serverMock(file);
    const progress: number[] = [];
    const result = await resumeUpload(makeUpload(), file, {
      ...server,
      onProgress: (uploaded) => progress.push(uploaded),
    });
    expect(server.calls).toEqual([0, 10, 20]);
    expect(result.status).toBe("ready");
    expect(result.page_count).toBe(3);
    expect(progress.at(-1)).toBe(25);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("resumes from the server offset after a network failure", async () => {
    const file = new File(["y".repeat(25)], "b.pdf");
    const networkError = new ApiError(0, {
      code: "network_error",
      message: "offline",
      hint: null,
      details: {},
    });
    const server = serverMock(file, { 2: networkError });
    const result = await resumeUpload(makeUpload(), file, { ...server, retryBaseMs: 1 });
    expect(result.offset).toBe(25);
    expect(server.readOffset).toHaveBeenCalledTimes(1);
    expect(server.calls).toEqual([0, 10, 10, 20]);
  });

  it("does not retry validation errors", async () => {
    const file = new File(["z".repeat(25)], "c.pdf");
    const rejection = new ApiError(415, {
      code: "unsupported_file",
      message: "nope",
      hint: null,
      details: {},
    });
    const server = serverMock(file, { 1: rejection });
    await expect(resumeUpload(makeUpload(), file, { ...server, retryBaseMs: 1 })).rejects.toBe(
      rejection,
    );
    expect(server.readOffset).not.toHaveBeenCalled();
  });

  it("gives up after the retry budget", async () => {
    const file = new File(["w".repeat(25)], "d.pdf");
    const failing = new ApiError(503, {
      code: "unavailable",
      message: "busy",
      hint: null,
      details: {},
    });
    const sendChunk = vi.fn(async () => {
      throw failing;
    });
    const readOffset = vi.fn(async () => 0);
    await expect(
      resumeUpload(makeUpload(), file, { sendChunk, readOffset, maxRetries: 2, retryBaseMs: 1 }),
    ).rejects.toBe(failing);
    expect(sendChunk).toHaveBeenCalledTimes(3);
  });

  it("continues an upload that was already partly sent", async () => {
    const file = new File(["v".repeat(25)], "e.pdf");
    const sendChunk = vi.fn(async (request: ChunkRequest) =>
      makeUpload({
        offset: request.offset + request.chunk.size,
        status: request.offset + request.chunk.size === 25 ? "ready" : "uploading",
      }),
    );
    await resumeUpload(makeUpload({ offset: 20 }), file, { sendChunk, readOffset: vi.fn() });
    expect(sendChunk).toHaveBeenCalledTimes(1);
    expect(sendChunk.mock.calls[0][0].offset).toBe(20);
  });
});
