import type { Metadata } from "next";
import { Suspense } from "react";

import { OAuthMfa } from "@/components/auth/forms";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Two-step verification" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <OAuthMfa />
    </Suspense>
  );
}
