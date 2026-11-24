import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminLogin } from "@/components/admin/admin-login";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "adminPanel" });
  return { title: `${t("prefix")} · ${t("login.title")}`, robots: { index: false, follow: false } };
}

export default async function AdminLoginPage({ params }: PageProps<"/[locale]/admin/login">) {
  await initPage(params);
  return <AdminLogin />;
}
