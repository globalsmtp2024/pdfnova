import type { Metadata } from "next";

import { AdminTitle, adminMetadata } from "@/components/admin/admin-title";
import { Users } from "@/components/admin/admin-page";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/users">): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, "users");
}

export default async function AdminUsersPage({ params }: PageProps<"/[locale]/admin/users">) {
  await initPage(params);
  return (
    <>
      <AdminTitle navKey="users" />
      <Users />
    </>
  );
}
