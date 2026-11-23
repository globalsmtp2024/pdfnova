import type { Metadata } from "next";
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

import { TeamDetailView } from "@/components/teams/team-detail";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

async function TeamContent({ params }: { params: PageProps<"/[locale]/dashboard/teams/[id]">["params"] }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <TeamDetailView id={id} />;
}

export function generateStaticParams() {
  return [{ id: "preview" }];
}

export default function Page({ params }: PageProps<"/[locale]/dashboard/teams/[id]">) {
  return (
    <div className="container-page py-10">
      <Suspense fallback={null}>
        <TeamContent params={params} />
      </Suspense>
    </div>
  );
}
