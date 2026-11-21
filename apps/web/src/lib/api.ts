export type ApiErrorBody = {
  code: string;
  message: string;
  hint: string | null;
  details: Record<string, unknown>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint: string | null;
  readonly details: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.hint = body.hint;
    this.details = body.details;
  }

  get upgradeTo(): string | null {
    const value = this.details.upgrade_to;
    return typeof value === "string" ? value : null;
  }
}

export const NETWORK_ERROR: ApiErrorBody = {
  code: "network_error",
  message: "We could not reach the server.",
  hint: "Check your connection and try again.",
  details: {},
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_COOKIE = "pn_csrf";

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}

let csrfBootstrap: Promise<void> | null = null;

async function ensureCsrfCookie(): Promise<void> {
  if (readCookie(CSRF_COOKIE)) return;
  csrfBootstrap ??= fetch("/api/v1/auth/csrf", { credentials: "include" })
    .then(() => undefined)
    .finally(() => {
      csrfBootstrap = null;
    });
  await csrfBootstrap;
}

export async function parseError(response: Response): Promise<ApiError> {
  try {
    const payload = (await response.json()) as { error?: ApiErrorBody };
    if (payload.error) return new ApiError(response.status, payload.error);
  } catch {
    return new ApiError(response.status, {
      code: "http_error",
      message: `The server responded with ${response.status}.`,
      hint: "Please try again.",
      details: {},
    });
  }
  return new ApiError(response.status, {
    code: "http_error",
    message: `The server responded with ${response.status}.`,
    hint: "Please try again.",
    details: {},
  });
}

export type RequestOptions = Omit<RequestInit, "body"> & {
  json?: unknown;
  body?: BodyInit | null;
};

export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  let body = options.body ?? null;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }
  if (!SAFE_METHODS.has(method)) {
    await ensureCsrfCookie();
    const token = readCookie(CSRF_COOKIE);
    if (token) headers.set("X-CSRF-Token", token);
  }
  let response: Response;
  try {
    response = await fetch(path, { ...options, method, headers, body, credentials: "include" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (!response.ok) throw await parseError(response);
  return response;
}

export async function apiJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
