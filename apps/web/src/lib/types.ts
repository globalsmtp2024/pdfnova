export type TaskStatus =
  "created" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";

export type TaskFile = {
  id: string;
  filename: string;
  size: number;
  mime_type: string;
  kind: string;
  page_count: number | null;
  status: string;
  download_url: string | null;
};

export type Task = {
  id: string;
  tool: string;
  status: TaskStatus;
  progress: number;
  progress_label: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
  files_deleted: boolean;
  input_bytes: number;
  output_bytes: number;
  estimated_seconds: number | null;
  inputs: TaskFile[];
  outputs: TaskFile[];
};

export type Upload = {
  id: string;
  task_id: string;
  filename: string;
  size: number;
  offset: number;
  chunk_size: number;
  status: "uploading" | "ready" | "rejected";
  kind: string | null;
  page_count: number | null;
  encrypted: boolean;
  rejection_reason: string | null;
};

export type TaskEvent = {
  status: TaskStatus;
  progress: number;
  label: string;
  error_code: string | null;
  error_message: string | null;
};

export type ToolDescription = {
  slug: string;
  name: string;
  category: string;
  summary: string;
  input_spec: {
    min_files: number;
    max_files: number;
    accepted_kinds: string[];
    max_file_bytes: number | null;
  };
  options_schema: Record<string, unknown>;
  uses_ai: boolean;
};

export type User = {
  id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
  totp_enabled: boolean;
  has_password: boolean;
  is_admin: boolean;
  locale: string;
  created_at: string;
  retention_extended: boolean;
  retention_seconds: number;
  ai_key: { provider: string; last4: string } | null;
};

export type LoginResponse = {
  user: User | null;
  mfa_required: boolean;
  mfa_token: string | null;
};
