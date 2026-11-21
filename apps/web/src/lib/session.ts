"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { LIVE_TOOL_SLUGS } from "@/config/live";
import { ApiError, apiJson } from "@/lib/api";
import { useHydrated } from "@/lib/use-hydrated";
import type { LoginResponse, ToolDescription, User } from "@/lib/types";

export const SESSION_KEY = ["session"] as const;
export const TOOLS_KEY = ["tools"] as const;

async function fetchSession(): Promise<User | null> {
  try {
    return await apiJson<User>("/api/v1/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      try {
        const refreshed = await apiJson<LoginResponse>("/api/v1/auth/refresh", { method: "POST" });
        return refreshed.user;
      } catch {
        return null;
      }
    }
    throw error;
  }
}

type HydrationSafe<T> = Omit<UseQueryResult<T>, "data" | "isPending"> & {
  data: T | undefined;
  isPending: boolean;
};

function untilHydrated<T>(query: UseQueryResult<T>, hydrated: boolean): HydrationSafe<T> {
  if (hydrated) return query;
  return { ...query, data: undefined, isPending: true, isError: false };
}

export function useSession(): HydrationSafe<User | null> {
  const query = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, staleTime: 60_000 });
  return untilHydrated(query, useHydrated());
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<{ message: string }>("/api/v1/auth/logout", { method: "POST" }),
    onSettled: () => queryClient.setQueryData(SESSION_KEY, null),
  });
}

export function useAvailableTools(): HydrationSafe<ToolDescription[]> {
  const query = useQuery({
    queryKey: TOOLS_KEY,
    queryFn: () => apiJson<ToolDescription[]>("/api/v1/tools"),
    select: (tools) => tools.filter((tool) => LIVE_TOOL_SLUGS.has(tool.slug)),
    staleTime: 5 * 60_000,
  });
  return untilHydrated(query, useHydrated());
}
