"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiJson } from "@/lib/api";
import type { GraphEdge, GraphNode } from "@/lib/workflow-graph";

export type Schedule = {
  id: string;
  name: string;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  frequency: "hourly" | "daily" | "weekly";
  hour_utc: number;
  weekday: number | null;
  source_folder_id: string | null;
  destination_folder_id: string | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string;
};
export type ScheduleRun = {
  id: string;
  status: string;
  message: string;
  files: number;
  created_at: string;
  finished_at: string | null;
};
export type ScheduleInput = {
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  frequency: string;
  hour_utc: number;
  weekday: number | null;
  source_folder_id: string | null;
  destination_folder_id: string | null;
  enabled: boolean;
};

const ROOT = ["schedules"] as const;

export function useSchedules(enabled: boolean) {
  return useQuery({
    queryKey: ROOT,
    queryFn: () => apiJson<Schedule[]>("/api/v1/schedules"),
    enabled,
    refetchInterval: 15000,
  });
}

export function useScheduleRuns(id: string | null) {
  return useQuery({
    queryKey: [...ROOT, id, "runs"],
    queryFn: () => apiJson<ScheduleRun[]>(`/api/v1/schedules/${id}/runs`),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
}

export function useScheduleMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ROOT });
  return {
    create: useMutation({
      mutationFn: (input: ScheduleInput) =>
        apiJson<Schedule>("/api/v1/schedules", { method: "POST", json: input }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; body: ScheduleInput }) =>
        apiJson<Schedule>(`/api/v1/schedules/${input.id}`, { method: "PUT", json: input.body }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await apiFetch(`/api/v1/schedules/${id}`, { method: "DELETE" });
      },
      onSuccess: refresh,
    }),
    runNow: useMutation({
      mutationFn: (id: string) => apiJson<Schedule>(`/api/v1/schedules/${id}/run`, { method: "POST" }),
      onSuccess: refresh,
    }),
  };
}
