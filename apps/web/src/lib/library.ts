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
  teamId: string | null;
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
      if (query.teamId) params.set("team_id", query.teamId);
      if (query.folderId) params.set("folder_id", query.folderId);
      if (query.q) params.set("q", query.q);
      if (query.tag) params.set("tag", query.tag);
      if (query.trash) params.set("trash", "true");
      return apiJson<LibraryFile[]>(`/api/v1/library/files?${params.toString()}`);
    },
    enabled,
  });
}

function scoped(path: string, teamId: string | null): string {
  return teamId ? `${path}${path.includes("?") ? "&" : "?"}team_id=${teamId}` : path;
}

export function useLibraryFolders(enabled: boolean, teamId: string | null = null) {
  return useQuery({
    queryKey: [...ROOT, "folders", teamId],
    queryFn: () => apiJson<LibraryFolder[]>(scoped("/api/v1/library/folders", teamId)),
    enabled,
  });
}

export function useLibraryQuota(enabled: boolean, teamId: string | null = null) {
  return useQuery({
    queryKey: [...ROOT, "quota", teamId],
    queryFn: () => apiJson<LibraryQuota>(scoped("/api/v1/library/quota", teamId)),
    enabled,
  });
}

export function useLibraryMutations(teamId: string | null = null) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ROOT });
  return {
    teamId,
    createFolder: useMutation({
      mutationFn: (input: { name: string; parent_id: string | null }) =>
        apiJson<LibraryFolder>(scoped("/api/v1/library/folders", teamId), {
          method: "POST",
          json: input,
        }),
      onSuccess: refresh,
    }),
    renameFolder: useMutation({
      mutationFn: (input: { id: string; name: string }) =>
        apiJson<LibraryFolder>(scoped(`/api/v1/library/folders/${input.id}`, teamId), {
          method: "PATCH",
          json: { name: input.name },
        }),
      onSuccess: refresh,
    }),
    deleteFolder: useMutation({
      mutationFn: (id: string) =>
        apiJson<{ trashed_files: number }>(scoped(`/api/v1/library/folders/${id}`, teamId), {
          method: "DELETE",
        }),
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
        return apiJson<LibraryFile>(scoped(`/api/v1/library/files/${id}`, teamId), {
          method: "PATCH",
          json: body,
        });
      },
      onSuccess: refresh,
    }),
    trashFile: useMutation({
      mutationFn: (id: string) =>
        apiJson<LibraryFile>(scoped(`/api/v1/library/files/${id}`, teamId), { method: "DELETE" }),
      onSuccess: refresh,
    }),
    restoreFile: useMutation({
      mutationFn: (id: string) =>
        apiJson<LibraryFile>(scoped(`/api/v1/library/files/${id}/restore`, teamId), {
          method: "POST",
        }),
      onSuccess: refresh,
    }),
    deleteForever: useMutation({
      mutationFn: async (id: string) => {
        await apiFetch(scoped(`/api/v1/library/files/${id}/permanent`, teamId), {
          method: "DELETE",
        });
      },
      onSuccess: refresh,
    }),
    emptyTrash: useMutation({
      mutationFn: () =>
        apiJson<{ deleted: number }>(scoped("/api/v1/library/trash", teamId), { method: "DELETE" }),
      onSuccess: refresh,
    }),
    upload: useMutation({
      mutationFn: async (input: { file: File; folderId: string | null }) => {
        const form = new FormData();
        form.append("file", input.file);
        if (input.folderId) form.append("folder_id", input.folderId);
        if (teamId) form.append("team_id", teamId);
        const response = await apiFetch("/api/v1/library/files", { method: "POST", body: form });
        return (await response.json()) as LibraryFile;
      },
      onSuccess: refresh,
    }),
    saveFromTask: useMutation({
      mutationFn: (input: { task_id: string; output_file_id: string }) =>
        apiJson<LibraryFile>("/api/v1/library/files/from-task", {
          method: "POST",
          json: teamId ? { ...input, team_id: teamId } : input,
        }),
      onSuccess: refresh,
    }),
  };
}
