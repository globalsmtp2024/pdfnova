"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiJson } from "@/lib/api";
import { SESSION_KEY } from "@/lib/session";
import type { User } from "@/lib/types";

export type UsageWindow = {
  used: number;
  limit: number;
  window_seconds: number;
  reset_at: string | null;
};
export type Usage = {
  hourly_tasks: UsageWindow;
  daily_tasks: UsageWindow;
  ai_requests: UsageWindow;
  active_jobs: number;
  concurrent_jobs_limit: number;
  uses_own_ai_key: boolean;
  retention_seconds: number;
};
export const API_SCOPES = [
  "tasks:read",
  "tasks:write",
  "library:read",
  "library:write",
  "esign:read",
  "esign:write",
  "teams:read",
  "teams:write",
  "webhooks:manage",
] as const;

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};
export type HistoryItem = {
  id: string;
  tool: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  expires_at: string;
  files_deleted: boolean;
  file_names: string[];
  output_bytes: number;
};
export type Session = {
  id: string;
  user_agent: string;
  last_active_at: string;
  expires_at: string;
  current: boolean;
};

export const useUsage = () =>
  useQuery({
    queryKey: ["usage"],
    queryFn: () => apiJson<Usage>("/api/v1/usage"),
    refetchInterval: 60_000,
  });
export const useHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ["history"],
    queryFn: () => apiJson<HistoryItem[]>("/api/v1/me/history"),
    enabled,
  });
export const useApiKeys = (enabled: boolean) =>
  useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiJson<ApiKey[]>("/api/v1/me/api-keys"),
    enabled,
  });
export const useApiUsage = (enabled: boolean) =>
  useQuery({
    queryKey: ["api-usage"],
    queryFn: () =>
      apiJson<{ days: { date: string; tasks: number }[]; by_key: Record<string, number> }>(
        "/api/v1/me/api-usage",
      ),
    enabled,
  });
export const useSessions = (enabled: boolean) =>
  useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiJson<Session[]>("/api/v1/auth/sessions"),
    enabled,
  });

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<{ display_name: string; locale: string; retention_extended: boolean }>,
    ) => apiJson<User>("/api/v1/me", { method: "PATCH", json: body }),
    onSuccess: (user) => {
      queryClient.setQueryData(SESSION_KEY, user);
      void queryClient.invalidateQueries({ queryKey: ["usage"] });
    },
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; scopes: string[] | null }) =>
      apiJson<ApiKey & { secret: string }>("/api/v1/me/api-keys", {
        method: "POST",
        json: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/me/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}
