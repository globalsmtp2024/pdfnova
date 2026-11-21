import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/blocks";
import { brand } from "@/config/brand";
import { siteUrl } from "@/config/site";
import { findPost, POSTS } from "@/content/blog/posts";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { initPage, pageMetadata } from "@/lib/page";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => POSTS.map((post) => ({ locale, slug: post.slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/blog/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = findPost(slug);
  if (!post) return {};
  return {
    ...pageMetadata(locale, `/blog/${slug}`, post.title, post.description),
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps<"/[locale]/blog/[slug]">) {
  const { slug } = await initPage(params);
  const post = findPost(slug);
  if (!post) notFound();
  const t = await getTranslations("common");
  const { default: Content } = (await import(`@/content/blog/${slug}.mdx`)) as {
    default: ComponentType;
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: brand.name },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
  };
  const others = POSTS.filter((entry) => entry.slug !== post.slug).slice(0, 2);
  return (
    <article className="container-page max-w-3xl py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: "Blog", href: "/blog" },
          { label: post.title },
        ]}
      />
      <header className="mt-8 flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <Badge key={tag} tone="primary">
              {tag}
            </Badge>
          ))}
        </div>
        <h1 className="text-h1 font-extrabold tracking-tight">{post.title}</h1>
        <p className="text-lg text-muted">{post.description}</p>
        <p className="text-sm text-muted">
          {post.author} · <time dateTime={post.date}>{post.date}</time> ·{" "}
          {t("minutesRead", { minutes: post.minutes })}
        </p>
      </header>
      <div className="mt-6 border-t border-border pt-2">
        <Content />
      </div>
      {others.length ? (
        <aside className="mt-16 border-t border-border pt-8">
          <h2 className="font-display text-lg font-semibold">{t("readMore")}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {others.map((entry) => (
              <li key={entry.slug}>
                <Link
                  href={`/blog/${entry.slug}`}
                  className="block rounded-(--radius-card) border border-border bg-surface p-4 hover:border-primary/40"
                >
                  <span className="font-semibold">{entry.title}</span>
                  <span className="mt-1 block text-sm text-muted">{entry.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </article>
  );
}
