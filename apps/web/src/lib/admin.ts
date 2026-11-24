"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiJson } from "@/lib/api";

export type HealthReport = {
  uptime_seconds: number;
  environment: string;
  checks: {
    database: { ok: boolean };
    storage: { ok: boolean };
    disk: { ok: boolean; free_bytes: number; total_bytes: number };
    binaries: Record<string, { ok: boolean }>;
    queue: { ok: boolean; backend: string };
  };
  counts: { users: number; tasks_24h: number; failed_24h: number; running: number };
};
export type JobMetrics = {
  days: { date: string; total: number; failed: number }[];
  tools: {
    tool: string;
    total: number;
    succeeded: number;
    failed: number;
    avg_seconds: number;
    p95_seconds: number;
  }[];
};
export type Failure = {
  id: string;
  tool: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  attempts: number;
  input_bytes: number;
  signed_in: boolean;
};
export type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  is_admin: boolean;
  email_verified: boolean;
  retention_extended: boolean;
  created_at: string;
  last_login_at: string | null;
  tasks_30d: number;
};
export type Flag = { key: string; enabled: boolean; description: string };
export type FairUseValue = { key: string; value: number };
export type AbuseItem = {
  id: string;
  kind: string;
  target: string;
  reason: string;
  status: string;
  created_at: string;
  note: string;
  reported_by_user: boolean;
};
export type AnnouncementSettings = {
  enabled: boolean;
  message_en: string;
  message_ur: string;
  href: string;
};

export type AdminAnalytics = {
  days: number;
  users: {
    total: number;
    verified: number;
    admins: number;
    new_in_period: number;
    new_this_week: number;
    active_this_week: number;
    disabled: number;
    unverified: number;
    two_step: number;
  };
  tasks: {
    total: number;
    in_period: number;
    succeeded: number;
    failed: number;
    success_rate: number | null;
    signed_in: number;
    guest: number;
    via_api: number;
    avg_seconds: number;
    p95_seconds: number;
    input_bytes: number;
    output_bytes: number;
  };
  ai_requests: number;
  open_reports: number;
  series: { date: string; tasks: number; failed: number; signups: number }[];
  top_tools: { tool: string; total: number }[];
  categories: { category: string; total: number }[];
  unused_tools: string[];
  recent_users: { id: string; email: string; display_name: string; created_at: string }[];
};

export type AdminUserDetail = {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  is_admin: boolean;
  email_verified: boolean;
  retention_extended: boolean;
  two_step: boolean;
  locale: string;
  created_at: string;
  last_login_at: string | null;
  failed_logins: number;
  locked: boolean;
  oauth: string[];
  ai_provider: string | null;
  tasks: {
    total: number;
    last_30_days: number;
    succeeded: number;
    failed: number;
    input_bytes: number;
  };
  top_tools: { tool: string; total: number }[];
  recent_tasks: {
    id: string;
    tool: string;
    status: string;
    error_code: string | null;
    created_at: string;
  }[];
  assets: {
    api_keys: number;
    webhooks: number;
    teams: number;
    library_files: number;
    schedules: number;
    open_sessions: number;
  };
};

const ROOT = ["admin"] as const;

export const useHealth = () =>
  useQuery({
    queryKey: [...ROOT, "health"],
    queryFn: () => apiJson<HealthReport>("/api/v1/admin/health"),
    refetchInterval: 30000,
  });
export const useAdminUserDetail = (id: string | null) =>
  useQuery({
    queryKey: [...ROOT, "user", id],
    queryFn: () => apiJson<AdminUserDetail>(`/api/v1/admin/users/${id}/detail`),
    enabled: id !== null,
  });
export const useAnalytics = (days: number) =>
  useQuery({
    queryKey: [...ROOT, "analytics", days],
    queryFn: () => apiJson<AdminAnalytics>(`/api/v1/admin/analytics?days=${days}`),
    refetchInterval: 60000,
  });
export const useJobMetrics = (days: number) =>
  useQuery({
    queryKey: [...ROOT, "jobs", days],
    queryFn: () => apiJson<JobMetrics>(`/api/v1/admin/jobs?days=${days}`),
  });
export const useFailures = (tool: string, code: string) =>
  useQuery({
    queryKey: [...ROOT, "failures", tool, code],
    queryFn: () =>
      apiJson<Failure[]>(
        `/api/v1/admin/failures?${new URLSearchParams({ tool, code }).toString()}`,
      ),
  });
export const useAdminUsers = (q: string) =>
  useQuery({
    queryKey: [...ROOT, "users", q],
    queryFn: () =>
      apiJson<AdminUser[]>(`/api/v1/admin/users?${new URLSearchParams({ q }).toString()}`),
  });
export const useFlags = () =>
  useQuery({ queryKey: [...ROOT, "flags"], queryFn: () => apiJson<Flag[]>("/api/v1/admin/flags") });
export const useFairUse = () =>
  useQuery({
    queryKey: [...ROOT, "fair-use"],
    queryFn: () => apiJson<FairUseValue[]>("/api/v1/admin/fair-use"),
  });
export const useAbuse = (status: string) =>
  useQuery({
    queryKey: [...ROOT, "abuse", status],
    queryFn: () => apiJson<AbuseItem[]>(`/api/v1/admin/abuse?status=${status}`),
  });
export const useAnnouncementSettings = () =>
  useQuery({
    queryKey: [...ROOT, "announcement"],
    queryFn: () => apiJson<AnnouncementSettings>("/api/v1/admin/announcement"),
  });

export function useAdminMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ROOT });
  return {
    patchUser: useMutation({
      mutationFn: (input: {
        id: string;
        body: Partial<Pick<AdminUser, "is_active" | "is_admin" | "retention_extended">>;
      }) =>
        apiJson<AdminUser>(`/api/v1/admin/users/${input.id}`, {
          method: "PATCH",
          json: input.body,
        }),
      onSuccess: refresh,
    }),
    setFlag: useMutation({
      mutationFn: (input: { key: string; enabled: boolean }) =>
        apiJson(`/api/v1/admin/flags/${input.key}`, {
          method: "PUT",
          json: { enabled: input.enabled },
        }),
      onSuccess: () => {
        void refresh();
        void queryClient.invalidateQueries({ queryKey: ["flags"] });
      },
    }),
    saveFairUse: useMutation({
      mutationFn: (values: Record<string, number>) =>
        apiJson<FairUseValue[]>("/api/v1/admin/fair-use", { method: "PUT", json: values }),
      onSuccess: refresh,
    }),
    saveAnnouncement: useMutation({
      mutationFn: (body: AnnouncementSettings) =>
        apiJson("/api/v1/admin/announcement", { method: "PUT", json: body }),
      onSuccess: () => {
        void refresh();
        void queryClient.invalidateQueries({ queryKey: ["announcement"] });
      },
    }),
    resolveAbuse: useMutation({
      mutationFn: (input: { id: string; status: "actioned" | "dismissed"; note: string }) =>
        apiJson(`/api/v1/admin/abuse/${input.id}/resolve`, {
          method: "POST",
          json: { status: input.status, note: input.note },
        }),
      onSuccess: refresh,
    }),
  };
}
