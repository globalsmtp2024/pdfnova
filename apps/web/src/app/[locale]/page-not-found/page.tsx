import type { Metadata } from "next";

import NotFound from "@/app/[locale]/not-found";
import { initPage } from "@/lib/page";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default async function PageNotFound({ params }: PageProps<"/[locale]/page-not-found">) {
  await initPage(params);
  return <NotFound />;
}
