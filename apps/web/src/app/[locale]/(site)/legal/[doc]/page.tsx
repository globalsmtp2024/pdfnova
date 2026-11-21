import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/ui/page-hero";
import { findLegalDocument, LEGAL_DOCUMENTS } from "@/content/legal";
import { routing } from "@/i18n/routing";
import { initPage, pageMetadata } from "@/lib/page";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    LEGAL_DOCUMENTS.map((document) => ({ locale, doc: document.slug })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/legal/[doc]">): Promise<Metadata> {
  const { locale, doc } = await params;
  const document = findLegalDocument(doc);
  return document ? pageMetadata(locale, `/legal/${doc}`, document.title, document.summary) : {};
}

export default async function LegalPage({ params }: PageProps<"/[locale]/legal/[doc]">) {
  const { doc } = await initPage(params);
  const document = findLegalDocument(doc);
  if (!document) notFound();
  const t = await getTranslations("common");
  return (
    <>
      <PageHero
        title={document.title}
        subtitle={document.summary}
        breadcrumbs={[{ label: t("home"), href: "/" }, { label: document.title }]}
      />
      <div className="container-page grid gap-10 py-12 lg:grid-cols-[15rem_1fr]">
        <nav aria-label={t("onThisPage")} className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {t("onThisPage")}
          </p>
          <ol className="flex flex-col gap-1 text-sm">
            {document.sections.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="block rounded-lg px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground"
                >
                  {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="flex max-w-[70ch] flex-col gap-10">
          <p className="text-sm text-muted">{t("lastUpdated", { date: document.updated })}</p>
          {document.sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-h3 font-semibold">
                {index + 1}. {section.title}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-3 flex list-disc flex-col gap-1.5 ps-5 text-muted">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
              {section.table ? (
                <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead className="bg-surface-muted">
                      <tr>
                        {section.table.headers.map((header) => (
                          <th
                            key={header}
                            scope="col"
                            className="px-4 py-2.5 text-start font-semibold"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                      {section.table.rows.map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell, cellIndex) => (
                            <td
                              key={`${row[0]}-${cellIndex}`}
                              className={
                                cellIndex === 0
                                  ? "px-4 py-2.5 font-mono text-xs"
                                  : "px-4 py-2.5 text-muted"
                              }
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
