import type { Metadata } from "next";
import { Suspense } from "react";

import { RegisterForm } from "@/components/auth/forms";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <RegisterForm />
    </Suspense>
  );
}
