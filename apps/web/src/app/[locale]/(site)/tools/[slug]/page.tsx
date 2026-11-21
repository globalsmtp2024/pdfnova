import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { RelatedToolsSection, ToolLanding } from "@/components/tools/tool-landing";
import { ToolIcon } from "@/components/tools/tool-icon";
import { LiveGate, ToolPage } from "@/components/tools/tool-page";
import { MeshBackground } from "@/components/ui/backgrounds";
import { Breadcrumbs } from "@/components/ui/blocks";
import { categoryOf, findTool, TOOLS } from "@/config/tools";
import { routing } from "@/i18n/routing";
import { alternatesFor } from "@/lib/seo";
import { toolText } from "@/lib/tool-text";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => TOOLS.map((tool) => ({ locale, slug: tool.slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/tools/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const tool = findTool(slug);
  if (!tool) return {};
  const text = toolText(await getTranslations({ locale, namespace: "tools" }), tool);
  return {
    title: text.name,
    description: text.description,
    alternates: alternatesFor(locale, `/tools/${slug}`),
    openGraph: { title: text.name, description: text.description },
  };
}

export default async function ToolRoute({ params }: PageProps<"/[locale]/tools/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const tool = findTool(slug);
  if (!tool) notFound();
  const t = await getTranslations();
  const text = toolText(await getTranslations("tools"), tool);
  const category = categoryOf(tool.category);
  return (
    <>
      <section className="relative isolate overflow-hidden">
        <MeshBackground pattern="dots" />
        <div className="container-page flex flex-col gap-8 pt-6 pb-14 sm:pb-20">
          <Breadcrumbs
            items={[
              { label: t("common.home"), href: "/" },
              { label: t("toolPage.breadcrumbTools"), href: "/tools" },
              {
                label: t(`categories.${tool.category}.label`),
                href: `/categories/${category.path}`,
              },
              { label: text.name },
            ]}
          />
          <div className="flex flex-col items-center gap-3 text-center">
            <ToolIcon slug={tool.slug} size="xl" />
            <h1 className="text-h1 font-extrabold tracking-tight">{text.name}</h1>
            <p className="max-w-xl text-lg text-muted">{text.description}</p>
          </div>
          <ToolPage slug={tool.slug} />
        </div>
      </section>
      <LiveGate slug={tool.slug}>
        <ToolLanding tool={tool} />
      </LiveGate>
      <RelatedToolsSection tool={tool} />
    </>
  );
}
