import type { Metadata } from "next";

import { AdminTitle, adminMetadata } from "@/components/admin/admin-title";
import { Abuse } from "@/components/admin/admin-page";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/reports">): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, "reports");
}

export default async function AdminReportsPage({ params }: PageProps<"/[locale]/admin/reports">) {
  await initPage(params);
  return (
    <>
      <AdminTitle navKey="reports" />
      <Abuse />
    </>
  );
}
