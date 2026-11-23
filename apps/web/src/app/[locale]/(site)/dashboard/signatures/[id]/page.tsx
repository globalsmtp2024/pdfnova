import type { Metadata } from "next";
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

import { EsignDetail } from "@/components/esign/esign-detail";

export const metadata: Metadata = { title: "Signature request", robots: { index: false } };

async function DetailContent({
  params,
}: {
  params: PageProps<"/[locale]/dashboard/signatures/[id]">["params"];
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <EsignDetail id={id} />;
}

export function generateStaticParams() {
  return [{ id: "preview" }];
}

export default function Page({ params }: PageProps<"/[locale]/dashboard/signatures/[id]">) {
  return (
    <div className="container-page py-10">
      <Suspense fallback={null}>
        <DetailContent params={params} />
      </Suspense>
    </div>
  );
}
