import type { Metadata } from "next";

import { AdminTitle, adminMetadata } from "@/components/admin/admin-title";
import { Dashboard } from "@/components/admin/analytics";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, "dashboard");
}

export default async function AdminDashboardPage({ params }: PageProps<"/[locale]/admin">) {
  await initPage(params);
  return (
    <>
      <AdminTitle navKey="dashboard" />
      <Dashboard />
    </>
  );
}
