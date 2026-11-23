import type { Metadata } from "next";
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

import { EsignSign } from "@/components/esign/esign-sign";

export const metadata: Metadata = { title: "Review and sign", robots: { index: false, follow: false } };

async function SignContent({ params }: { params: PageProps<"/[locale]/sign/[token]">["params"] }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  return <EsignSign token={token} />;
}

export function generateStaticParams() {
  return [{ token: "preview" }];
}

export default function Page({ params }: PageProps<"/[locale]/sign/[token]">) {
  return (
    <div className="container-page max-w-4xl py-10">
      <Suspense fallback={null}>
        <SignContent params={params} />
      </Suspense>
    </div>
  );
}
