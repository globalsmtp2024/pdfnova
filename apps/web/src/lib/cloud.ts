"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiJson } from "@/lib/api";

export type CloudProviderInfo = {
  name: string;
  label: string;
  connected: boolean;
  account: string;
};
export type CloudEntry = {
  id: string;
  name: string;
  is_folder: boolean;
  size: number | null;
  mime_type: string | null;
  modified: string | null;
};

const ROOT = ["cloud"] as const;

export function useCloudProviders(enabled: boolean) {
  return useQuery({
    queryKey: [...ROOT, "providers"],
    queryFn: () => apiJson<CloudProviderInfo[]>("/api/v1/cloud/providers"),
    enabled,
  });
}

export function useCloudFiles(provider: string | null, folder: string | null, query: string) {
  return useQuery({
    queryKey: [...ROOT, "files", provider, folder, query],
    queryFn: () => {
      const params = new URLSearchParams();
      if (folder) params.set("folder", folder);
      if (query) params.set("q", query);
      return apiJson<CloudEntry[]>(`/api/v1/cloud/${provider}/files?${params.toString()}`);
    },
    enabled: Boolean(provider),
    retry: false,
  });
}

export async function startCloudConnect(provider: string): Promise<void> {
  const { url } = await apiJson<{ url: string }>(`/api/v1/cloud/${provider}/connect`);
  window.location.assign(url);
}

export function useCloudDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => {
      await apiFetch(`/api/v1/cloud/${provider}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROOT }),
  });
}

export function useCloudExport() {
  return useMutation({
    mutationFn: (input: {
      provider: string;
      folder_id: string | null;
      library_file_id?: string;
      task_id?: string;
      output_file_id?: string;
    }) => {
      const { provider, ...body } = input;
      return apiJson<{ id: string; name: string }>(`/api/v1/cloud/${provider}/export`, {
        method: "POST",
        json: body,
      });
    },
  });
}

export function importCloudToTask(
  taskId: string,
  provider: string,
  fileId: string,
): Promise<import("@/lib/types").Upload> {
  return apiJson(`/api/v1/tasks/${taskId}/cloud-imports`, {
    method: "POST",
    json: { provider, file_id: fileId },
  });
}
