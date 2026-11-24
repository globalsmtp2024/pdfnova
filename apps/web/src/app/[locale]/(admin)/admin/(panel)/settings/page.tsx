import type { Metadata } from "next";

import { AdminTitle, adminMetadata } from "@/components/admin/admin-title";
import { AnnouncementEditor, FairUseEditor, Flags } from "@/components/admin/admin-page";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/settings">): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, "settings");
}

export default async function AdminSettingsPage({ params }: PageProps<"/[locale]/admin/settings">) {
  await initPage(params);
  return (
    <>
      <AdminTitle navKey="settings" />
      <Flags />
      <FairUseEditor />
      <AnnouncementEditor />
    </>
  );
}
