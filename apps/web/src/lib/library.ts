"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiJson } from "@/lib/api";

export type LibraryFolder = { id: string; name: string; parent_id: string | null };
export type LibraryFile = {
  id: string;
  name: string;
  folder_id: string | null;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  source_tool: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
export type LibraryQuota = {
  used_bytes: number;
  limit_bytes: number;
  file_count: number;
  trash_days: number;
};
export type LibraryQuery = {
  folderId: string | null;
  q: string;
  tag: string;
  trash: boolean;
};

const ROOT = ["library"] as const;

export function useLibraryFiles(query: LibraryQuery, enabled: boolean) {
  return useQuery({
    queryKey: [...ROOT, "files", query],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.folderId) params.set("folder_id", query.folderId);
      if (query.q) params.set("q", query.q);
      if (query.tag) params.set("tag", query.tag);
      if (query.trash) params.set("trash", "true");
      return apiJson<LibraryFile[]>(`/api/v1/library/files?${params.toString()}`);
    },
    enabled,
  });
}

export function useLibraryFolders(enabled: boolean) {
  return useQuery({
    queryKey: [...ROOT, "folders"],
    queryFn: () => apiJson<LibraryFolder[]>("/api/v1/library/folders"),
    enabled,
  });
}

export function useLibraryQuota(enabled: boolean) {
  return useQuery({
    queryKey: [...ROOT, "quota"],
    queryFn: () => apiJson<LibraryQuota>("/api/v1/library/quota"),
    enabled,
  });
}

export function useLibraryMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ROOT });
  return {
    createFolder: useMutation({
      mutationFn: (input: { name: string; parent_id: string | null }) =>
        apiJson<LibraryFolder>("/api/v1/library/folders", { method: "POST", json: input }),
      onSuccess: refresh,
    }),
    renameFolder: useMutation({
      mutationFn: (input: { id: string; name: string }) =>
        apiJson<LibraryFolder>(`/api/v1/library/folders/${input.id}`, {
          method: "PATCH",
          json: { name: input.name },
        }),
      onSuccess: refresh,
    }),
    deleteFolder: useMutation({
      mutationFn: (id: string) =>
        apiJson<{ trashed_files: number }>(`/api/v1/library/folders/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
    updateFile: useMutation({
      mutationFn: (input: {
        id: string;
        name?: string;
        tags?: string[];
        folder_id?: string | null;
        move?: boolean;
      }) => {
        const { id, ...body } = input;
        return apiJson<LibraryFile>(`/api/v1/library/files/${id}`, { method: "PATCH", json: body });
      },
      onSuccess: refresh,
    }),
    trashFile: useMutation({
      mutationFn: (id: string) =>
        apiJson<LibraryFile>(`/api/v1/library/files/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
    restoreFile: useMutation({
      mutationFn: (id: string) =>
        apiJson<LibraryFile>(`/api/v1/library/files/${id}/restore`, { method: "POST" }),
      onSuccess: refresh,
    }),
    deleteForever: useMutation({
      mutationFn: async (id: string) => {
        await apiFetch(`/api/v1/library/files/${id}/permanent`, { method: "DELETE" });
      },
      onSuccess: refresh,
    }),
    emptyTrash: useMutation({
      mutationFn: () => apiJson<{ deleted: number }>("/api/v1/library/trash", { method: "DELETE" }),
      onSuccess: refresh,
    }),
    upload: useMutation({
      mutationFn: async (input: { file: File; folderId: string | null }) => {
        const form = new FormData();
        form.append("file", input.file);
        if (input.folderId) form.append("folder_id", input.folderId);
        const response = await apiFetch("/api/v1/library/files", { method: "POST", body: form });
        return (await response.json()) as LibraryFile;
      },
      onSuccess: refresh,
    }),
    saveFromTask: useMutation({
      mutationFn: (input: { task_id: string; output_file_id: string }) =>
        apiJson<LibraryFile>("/api/v1/library/files/from-task", { method: "POST", json: input }),
      onSuccess: refresh,
    }),
  };
}
