import type { Metadata } from "next";
import { Suspense } from "react";

import { VerifyEmail } from "@/components/auth/forms";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Confirm email" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <VerifyEmail />
    </Suspense>
  );
}
