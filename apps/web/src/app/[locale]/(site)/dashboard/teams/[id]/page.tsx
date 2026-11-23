import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { TeamDetailView } from "@/components/teams/team-detail";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/teams/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "teams" });
  return { title: t("title"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/dashboard/teams/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <div className="container-page py-10">
      <TeamDetailView id={id} />
    </div>
  );
}
