import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Callout } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { brand } from "@/config/brand";
import { ACCESSIBILITY_COMMITMENTS } from "@/content/pages";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

const SUBTITLE =
  "We aim to meet WCAG 2.2 level AA across the whole site. Here is what we do and how to tell us when we fall short.";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/accessibility">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "/accessibility", "Accessibility statement", SUBTITLE);
}

export default async function AccessibilityPage({ params }: PageProps<"/[locale]/accessibility">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        title="Accessibility statement"
        subtitle={SUBTITLE}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("footer.links.accessibility") },
        ]}
      />
      <Section>
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <ul className="flex flex-col gap-3">
            {ACCESSIBILITY_COMMITMENTS.map((item) => (
              <li key={item} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-strong" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <Callout tone="info" title="Known limitations">
            Some planned tools, such as the visual PDF editor, are not yet available. We will test
            each one with keyboard and screen reader users before it ships.
          </Callout>
          <p className="text-muted">
            If something on {brand.name} is hard to use with your assistive technology, please tell
            us through the{" "}
            <Link href="/contact" className="font-medium text-primary underline">
              contact form
            </Link>
            . We aim to respond within two working days. You can also see every keyboard shortcut on
            the{" "}
            <Link href="/shortcuts" className="font-medium text-primary underline">
              shortcuts page
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
