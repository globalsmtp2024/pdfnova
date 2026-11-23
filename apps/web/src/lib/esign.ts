"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiJson } from "@/lib/api";

export type SignRecipient = {
  id: string;
  name: string;
  email: string;
  status: string;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
};
export type SignEvent = {
  event: string;
  at: string;
  recipient_name: string | null;
  detail: Record<string, unknown>;
};
export type SignFieldInfo = {
  id: string;
  recipient_id: string;
  kind: "signature" | "initials" | "date" | "text" | "checkbox";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label: string;
};
export type SignRequestSummary = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  expires_at: string;
  sent_at: string | null;
  completed_at: string | null;
  page_count: number;
  signed: number;
  total: number;
};
export type SignRequestDetail = SignRequestSummary & {
  message: string;
  original_sha256: string;
  signed_sha256: string | null;
  recipients: SignRecipient[];
  fields: SignFieldInfo[];
  events: SignEvent[];
};
export type SignerView = {
  title: string;
  message: string;
  sender: string;
  signer_name: string;
  expires_at: string;
  page_count: number;
  fields: SignFieldInfo[];
};

const LIST_KEY = ["esign", "requests"] as const;

export function useSignRequests(enabled: boolean) {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => apiJson<SignRequestSummary[]>("/api/v1/esign/requests"),
    enabled,
  });
}

export function useSignRequest(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...LIST_KEY, id],
    queryFn: () => apiJson<SignRequestDetail>(`/api/v1/esign/requests/${id}`),
    enabled,
  });
}

export function useSignRequestAction(id: string, action: "send" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiJson<SignRequestDetail>(`/api/v1/esign/requests/${id}/${action}`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData([...LIST_KEY, id], data);
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export type NewSignRequest = {
  file: File;
  metadata: {
    title: string;
    message: string;
    expires_days: number;
    recipients: { name: string; email: string }[];
    fields: {
      recipient: number;
      kind: string;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      required: boolean;
      label: string;
    }[];
    send: boolean;
  };
};

export function useCreateSignRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, metadata }: NewSignRequest) => {
      const form = new FormData();
      form.append("file", file);
      form.append("metadata", JSON.stringify(metadata));
      const response = await apiFetch("/api/v1/esign/requests", { method: "POST", body: form });
      return (await response.json()) as SignRequestDetail;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useSignerView(token: string) {
  return useQuery({
    queryKey: ["esign", "signer", token],
    queryFn: () => apiJson<SignerView>(`/api/v1/esign/sign/${token}`),
    retry: false,
    staleTime: Infinity,
  });
}

export function useSignerDocument(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ["esign", "document", token],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/esign/sign/${token}/document`);
      return new File([await response.blob()], "document.pdf", { type: "application/pdf" });
    },
    enabled,
    retry: false,
    staleTime: Infinity,
  });
}

export function useSubmitSignature(token: string) {
  return useMutation({
    mutationFn: (values: Record<string, string>) =>
      apiJson<{ completed: boolean }>(`/api/v1/esign/sign/${token}/submit`, {
        method: "POST",
        json: { values, consent: true },
      }),
  });
}

export function useDeclineSignature(token: string) {
  return useMutation({
    mutationFn: (reason: string) =>
      apiJson<{ declined: boolean }>(`/api/v1/esign/sign/${token}/decline`, {
        method: "POST",
        json: { reason },
      }),
  });
}

import type { LocalFile } from "@/components/tools/use-tool-session";

export function asLocalFile(file: File): LocalFile {
  return {
    key: `esign-${file.name}-${file.size}-${file.lastModified}`,
    file,
    name: file.name,
    size: file.size,
    status: "ready",
    uploaded: file.size,
    uploadId: null,
    pageCount: null,
    encrypted: false,
    password: "",
    unlocked: false,
    error: null,
  };
}
