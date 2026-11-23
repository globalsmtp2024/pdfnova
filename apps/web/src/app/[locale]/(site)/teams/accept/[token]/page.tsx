import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AcceptInvite } from "@/components/teams/accept-invite";

export const metadata: Metadata = { title: "Join a team", robots: { index: false, follow: false } };

async function AcceptContent({
  params,
}: {
  params: PageProps<"/[locale]/teams/accept/[token]">["params"];
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("teams");
  return (
    <>
      <h1 className="font-display text-3xl font-semibold">{t("acceptTitle")}</h1>
      <AcceptInvite token={token} />
    </>
  );
}

export function generateStaticParams() {
  return [{ token: "preview" }];
}

export default function Page({ params }: PageProps<"/[locale]/teams/accept/[token]">) {
  return (
    <div className="container-page flex max-w-xl flex-col gap-4 py-10">
      <Suspense fallback={null}>
        <AcceptContent params={params} />
      </Suspense>
    </div>
  );
}
