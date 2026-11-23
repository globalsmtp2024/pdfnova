import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AcceptInvite } from "@/components/teams/accept-invite";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/teams/accept/[token]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "teams" });
  return { title: t("acceptTitle"), robots: { index: false, follow: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/teams/accept/[token]">) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("teams");
  return (
    <div className="container-page flex max-w-xl flex-col gap-4 py-10">
      <h1 className="font-display text-3xl font-semibold">{t("acceptTitle")}</h1>
      <AcceptInvite token={token} />
    </div>
  );
}
