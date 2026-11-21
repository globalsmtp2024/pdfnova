export type Endpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "HEAD" | "PUT";
  path: string;
  summary: string;
  auth: "optional" | "required" | "none";
};

export type EndpointGroup = {
  id: string;
  title: string;
  description: string;
  endpoints: Endpoint[];
};

export const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    id: "tasks",
    title: "Tasks",
    description:
      "A task runs one tool on one or more files. Create it, add files, start it and download the results.",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/tasks",
        summary: "Create a task for a tool. Send an Idempotency-Key header to make retries safe.",
        auth: "optional",
      },
      {
        method: "GET",
        path: "/api/v1/tasks/{task_id}",
        summary: "Get status, progress, inputs and outputs with signed download links.",
        auth: "optional",
      },
      {
        method: "POST",
        path: "/api/v1/tasks/{task_id}/start",
        summary: "Start processing with tool options and an optional file order.",
        auth: "optional",
      },
      {
        method: "GET",
        path: "/api/v1/tasks/{task_id}/events",
        summary: "Server-Sent Events stream of progress until the task finishes.",
        auth: "optional",
      },
      {
        method: "POST",
        path: "/api/v1/tasks/{task_id}/cancel",
        summary: "Request cancellation of a queued or running task.",
        auth: "optional",
      },
      {
        method: "DELETE",
        path: "/api/v1/tasks/{task_id}",
        summary: "Delete the task’s files immediately.",
        auth: "optional",
      },
    ],
  },
  {
    id: "files",
    title: "Files and uploads",
    description: "Upload whole files with multipart, or large files with resumable chunks.",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/tasks/{task_id}/files",
        summary: "Upload a whole file as multipart form data.",
        auth: "optional",
      },
      {
        method: "POST",
        path: "/api/v1/tasks/{task_id}/uploads",
        summary: "Start a resumable upload; returns the chunk size.",
        auth: "optional",
      },
      {
        method: "PATCH",
        path: "/api/v1/uploads/{upload_id}",
        summary: "Send the next chunk with an Upload-Offset header.",
        auth: "optional",
      },
      {
        method: "HEAD",
        path: "/api/v1/uploads/{upload_id}",
        summary: "Read the current Upload-Offset to resume.",
        auth: "optional",
      },
      {
        method: "POST",
        path: "/api/v1/tasks/{task_id}/imports",
        summary: "Import a file from a public http or https link.",
        auth: "optional",
      },
      {
        method: "DELETE",
        path: "/api/v1/uploads/{upload_id}",
        summary: "Remove a file before the task starts.",
        auth: "optional",
      },
    ],
  },
  {
    id: "catalog",
    title: "Tools and limits",
    description: "Discover tools, their option schemas and the fair-use policy.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/tools",
        summary: "List tools with input specs and JSON Schema for options.",
        auth: "none",
      },
      { method: "GET", path: "/api/v1/tools/{slug}", summary: "Describe one tool.", auth: "none" },
      {
        method: "GET",
        path: "/api/v1/fair-use",
        summary: "The public fair-use limits.",
        auth: "none",
      },
      {
        method: "GET",
        path: "/api/v1/usage",
        summary: "Your current usage against each limit, with reset times.",
        auth: "optional",
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    description:
      "Manage API keys and your data. These endpoints need a signed-in session or an API key.",
    endpoints: [
      { method: "GET", path: "/api/v1/me/api-keys", summary: "List API keys.", auth: "required" },
      {
        method: "POST",
        path: "/api/v1/me/api-keys",
        summary: "Create an API key. The secret is shown once.",
        auth: "required",
      },
      {
        method: "DELETE",
        path: "/api/v1/me/api-keys/{key_id}",
        summary: "Revoke an API key.",
        auth: "required",
      },
      {
        method: "GET",
        path: "/api/v1/me/api-usage",
        summary: "Tasks per day for the last 14 days, by key.",
        auth: "required",
      },
      {
        method: "GET",
        path: "/api/v1/me/history",
        summary: "Your recent tasks.",
        auth: "required",
      },
      {
        method: "GET",
        path: "/api/v1/me/export",
        summary: "Download your data as JSON.",
        auth: "required",
      },
    ],
  },
];

export const ERROR_CODES: { code: string; status: number; meaning: string }[] = [
  {
    code: "validation_error",
    status: 422,
    meaning: "A field is missing or invalid. details.errors lists each problem.",
  },
  {
    code: "invalid_input",
    status: 422,
    meaning:
      "Files or options don’t suit the tool, for example too few files or a page range outside the document.",
  },
  {
    code: "unsupported_file",
    status: 415,
    meaning:
      "The file type isn’t accepted by this tool, or the file is damaged, protected or unsafe.",
  },
  { code: "payload_too_large", status: 413, meaning: "A file or chunk exceeds the size limit." },
  {
    code: "fair_use_limit",
    status: 429,
    meaning:
      "A fair-use cap was reached. details.reset_at says when it resets; Retry-After gives seconds.",
  },
  {
    code: "rate_limited",
    status: 429,
    meaning: "Too many requests per minute. Wait for Retry-After seconds.",
  },
  {
    code: "unauthenticated",
    status: 401,
    meaning: "Missing, invalid, expired or revoked credentials.",
  },
  {
    code: "csrf_failed",
    status: 403,
    meaning: "A cookie-authenticated request lacked the X-CSRF-Token header. API keys are exempt.",
  },
  {
    code: "not_found",
    status: 404,
    meaning: "The task, file or tool doesn’t exist, or belongs to someone else.",
  },
  {
    code: "conflict",
    status: 409,
    meaning: "The request conflicts with the current state, such as a wrong upload offset.",
  },
  {
    code: "url_import_failed",
    status: 422,
    meaning: "The link could not be imported, or points to a private address.",
  },
];

export const API_CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: "v1.1",
    date: "2026-11-19",
    changes: [
      "Added API keys with Bearer authentication",
      "Added /fair-use and /usage endpoints; limit errors now return 429 fair_use_limit with reset_at",
      "Added link imports at /tasks/{task_id}/imports",
      "Removed /plans",
    ],
  },
  {
    version: "v1.0",
    date: "2026-11-19",
    changes: ["Initial release: tasks, resumable uploads, Server-Sent Events, signed downloads"],
  },
];
