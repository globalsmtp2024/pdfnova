import { LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ContactForm } from "@/components/contact-form";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { brand } from "@/config/brand";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return pageMetadata(locale, "/contact", t("metaTitle"), t("subtitle"));
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        title={t("contact.title")}
        subtitle={t("contact.subtitle")}
        breadcrumbs={[{ label: t("common.home"), href: "/" }, { label: t("footer.links.contact") }]}
      />
      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div className="relative rounded-(--radius-card) border border-border bg-surface p-6 shadow-lifted sm:p-8">
            <ContactForm />
          </div>
          <aside className="flex flex-col gap-4">
            {[
              {
                icon: LifeBuoy,
                title: t("footer.links.help"),
                body: "Most questions are answered in the help center.",
                href: "/help",
              },
              {
                icon: ShieldCheck,
                title: t("footer.links.security"),
                body: "Report vulnerabilities privately with the Security report topic.",
                href: "/security",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex gap-3 rounded-(--radius-card) border border-border bg-surface p-5 hover:border-primary/40"
              >
                <item.icon className="size-5 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="block text-sm text-muted">{item.body}</span>
                </span>
              </Link>
            ))}
            <p className="flex items-center gap-2 px-1 text-sm text-muted">
              <Mail className="size-4" aria-hidden />
              <a href={`mailto:${brand.supportEmail}`} className="hover:text-foreground">
                {brand.supportEmail}
              </a>
            </p>
          </aside>
        </div>
      </Section>
    </>
  );
}
