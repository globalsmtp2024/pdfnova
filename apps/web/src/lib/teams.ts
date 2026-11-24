"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiJson } from "@/lib/api";
import type { GraphEdge, GraphNode } from "@/lib/workflow-graph";

export type TeamRole = "owner" | "admin" | "member" | "viewer";
export type Team = { id: string; name: string; role: TeamRole; member_count: number };
export type TeamMember = { user_id: string; email: string; display_name: string; role: TeamRole };
export type TeamInvite = { id: string; email: string; role: TeamRole; expires_at: string };
export type TeamDetail = Team & {
  members: TeamMember[];
  invites: TeamInvite[];
  permissions: string[];
};
export type TeamWorkflow = {
  id: string;
  name: string;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  created_by: string;
  updated_at: string;
};

const ROOT = ["teams"] as const;

export function useTeams(enabled: boolean) {
  return useQuery({
    queryKey: ROOT,
    queryFn: () => apiJson<Team[]>("/api/v1/teams"),
    enabled,
  });
}

export function useTeam(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...ROOT, id],
    queryFn: () => apiJson<TeamDetail>(`/api/v1/teams/${id}`),
    enabled,
  });
}

export function useTeamWorkflows(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...ROOT, id, "workflows"],
    queryFn: () => apiJson<TeamWorkflow[]>(`/api/v1/teams/${id}/workflows`),
    enabled: enabled && Boolean(id),
  });
}

export function useTeamMutations(id: string | null) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ROOT });
  return {
    create: useMutation({
      mutationFn: (name: string) =>
        apiJson<Team>("/api/v1/teams", { method: "POST", json: { name } }),
      onSuccess: refresh,
    }),
    rename: useMutation({
      mutationFn: (name: string) =>
        apiJson<Team>(`/api/v1/teams/${id}`, { method: "PATCH", json: { name } }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async () => {
        await apiFetch(`/api/v1/teams/${id}`, { method: "DELETE" });
      },
      onSuccess: refresh,
    }),
    invite: useMutation({
      mutationFn: (input: { email: string; role: string }) =>
        apiJson<TeamInvite>(`/api/v1/teams/${id}/invites`, { method: "POST", json: input }),
      onSuccess: refresh,
    }),
    revokeInvite: useMutation({
      mutationFn: async (inviteId: string) => {
        await apiFetch(`/api/v1/teams/${id}/invites/${inviteId}`, { method: "DELETE" });
      },
      onSuccess: refresh,
    }),
    changeRole: useMutation({
      mutationFn: (input: { userId: string; role: string }) =>
        apiJson<TeamMember>(`/api/v1/teams/${id}/members/${input.userId}`, {
          method: "PATCH",
          json: { role: input.role },
        }),
      onSuccess: refresh,
    }),
    removeMember: useMutation({
      mutationFn: async (userId: string) => {
        await apiFetch(`/api/v1/teams/${id}/members/${userId}`, { method: "DELETE" });
      },
      onSuccess: refresh,
    }),
    saveWorkflow: useMutation({
      mutationFn: (input: { name: string; nodes: GraphNode[]; edges: GraphEdge[] }) =>
        apiJson<TeamWorkflow>(`/api/v1/teams/${id}/workflows`, { method: "POST", json: input }),
      onSuccess: refresh,
    }),
    deleteWorkflow: useMutation({
      mutationFn: async (workflowId: string) => {
        await apiFetch(`/api/v1/teams/${id}/workflows/${workflowId}`, { method: "DELETE" });
      },
      onSuccess: refresh,
    }),
  };
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiJson<Team>("/api/v1/teams/invites/accept", { method: "POST", json: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROOT }),
  });
}
