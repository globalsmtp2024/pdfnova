import { setRequestLocale } from "next-intl/server";

import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminPanelLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminShell>{children}</AdminShell>;
}
