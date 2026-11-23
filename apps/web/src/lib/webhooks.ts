"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiJson } from "@/lib/api";

export type Webhook = {
  id: string;
  url: string;
  events: string[];
  description: string;
  active: boolean;
  secret_last4: string;
  created_at: string;
};
export type WebhookDelivery = {
  id: string;
  event: string;
  status: string;
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
  next_attempt_at: string | null;
};

const ROOT = ["webhooks"] as const;

export function useWebhooks(enabled: boolean) {
  return useQuery({
    queryKey: ROOT,
    queryFn: () => apiJson<Webhook[]>("/api/v1/webhooks"),
    enabled,
  });
}

export function useWebhookEvents() {
  return useQuery({
    queryKey: [...ROOT, "events"],
    queryFn: () => apiJson<{ events: string[] }>("/api/v1/webhooks/events"),
    staleTime: Infinity,
  });
}

export function useDeliveries(id: string | null) {
  return useQuery({
    queryKey: [...ROOT, id, "deliveries"],
    queryFn: () => apiJson<WebhookDelivery[]>(`/api/v1/webhooks/${id}/deliveries`),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
}

export function useWebhookMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ROOT });
  return {
    create: useMutation({
      mutationFn: (input: { url: string; events: string[]; description: string }) =>
        apiJson<Webhook & { secret: string }>("/api/v1/webhooks", { method: "POST", json: input }),
      onSuccess: refresh,
    }),
    toggle: useMutation({
      mutationFn: (input: { id: string; active: boolean }) =>
        apiJson<Webhook>(`/api/v1/webhooks/${input.id}`, {
          method: "PATCH",
          json: { active: input.active },
        }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await apiFetch(`/api/v1/webhooks/${id}`, { method: "DELETE" });
      },
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: (id: string) =>
        apiJson<WebhookDelivery>(`/api/v1/webhooks/${id}/test`, { method: "POST" }),
      onSuccess: refresh,
    }),
    retry: useMutation({
      mutationFn: (input: { id: string; deliveryId: string }) =>
        apiJson<WebhookDelivery>(
          `/api/v1/webhooks/${input.id}/deliveries/${input.deliveryId}/retry`,
          { method: "POST" },
        ),
      onSuccess: refresh,
    }),
  };
}
