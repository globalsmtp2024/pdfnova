import type { Metadata } from "next";

import { AdminTitle, adminMetadata } from "@/components/admin/admin-title";
import { Overview } from "@/components/admin/admin-page";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/system">): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, "system");
}

export default async function AdminSystemPage({ params }: PageProps<"/[locale]/admin/system">) {
  await initPage(params);
  return (
    <>
      <AdminTitle navKey="system" />
      <Overview />
    </>
  );
}
