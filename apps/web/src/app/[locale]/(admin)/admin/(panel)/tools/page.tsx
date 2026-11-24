import type { Metadata } from "next";

import { AdminTitle, adminMetadata } from "@/components/admin/admin-title";
import { ToolUsage } from "@/components/admin/analytics";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/tools">): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, "tools");
}

export default async function AdminToolsPage({ params }: PageProps<"/[locale]/admin/tools">) {
  await initPage(params);
  return (
    <>
      <AdminTitle navKey="tools" />
      <ToolUsage />
    </>
  );
}
