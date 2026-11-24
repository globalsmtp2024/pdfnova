import type { Metadata } from "next";

import { AdminTitle, adminMetadata } from "@/components/admin/admin-title";
import { Failures } from "@/components/admin/admin-page";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/jobs">): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, "jobs");
}

export default async function AdminJobsPage({ params }: PageProps<"/[locale]/admin/jobs">) {
  await initPage(params);
  return (
    <>
      <AdminTitle navKey="jobs" />
      <Failures />
    </>
  );
}
