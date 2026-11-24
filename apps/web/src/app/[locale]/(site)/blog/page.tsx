import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DocumentStackIllustration } from "@/components/illustrations";
import { Badge } from "@/components/ui/badge";
import { CategoryPill } from "@/components/ui/blocks";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { localizedPost, localizedTag, POSTS } from "@/content/blog/posts";
import { Link } from "@/i18n/navigation";
import { initPage, pageMetadata } from "@/lib/page";

export async function generateMetadata({ params }: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sitePages.blog" });
  return pageMetadata(locale, "/blog", t("metaTitle"), t("subtitle"));
}

export default async function BlogIndex({ params, searchParams }: PageProps<"/[locale]/blog">) {
  const { locale } = await initPage(params);
  const t = await getTranslations("common");
  const page = await getTranslations("sitePages.blog");
  const tags = Array.from(new Set(POSTS.flatMap((post) => post.tags))).sort();
  return (
    <>
      <PageHero
        title={page("metaTitle")}
        subtitle={page("subtitle")}
        breadcrumbs={[{ label: t("home"), href: "/" }, { label: page("metaTitle") }]}
        aside={<DocumentStackIllustration />}
      />
      <Section>
        <Suspense fallback={<Skeleton className="h-64" />}>
          <BlogList tags={tags} searchParams={searchParams} locale={locale} />
        </Suspense>
      </Section>
    </>
  );
}

async function BlogList({
  tags,
  searchParams,
  locale,
}: {
  locale: string;
  tags: string[];
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("common");
  const page = await getTranslations("sitePages.blog");
  const raw = (await searchParams).tag;
  const active = typeof raw === "string" && tags.includes(raw) ? raw : null;
  const posts = (active ? POSTS.filter((post) => post.tags.includes(active)) : POSTS).map((post) =>
    localizedPost(post, locale),
  );
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-2">
        <CategoryPill label={page("all")} href="/blog" active={active === null} />
        {tags.map((tag) => (
          <CategoryPill
            key={tag}
            label={localizedTag(tag, locale)}
            href={`/blog?tag=${encodeURIComponent(tag)}`}
            active={active === tag}
          />
        ))}
      </div>
      {locale === "ur" ? <p className="text-sm text-muted">{page("englishOnly")}</p> : null}
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="gradient-border flex h-full flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-6 shadow-soft transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lifted"
            >
              <div className="flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <Badge key={tag} tone="primary">
                    {tag}
                  </Badge>
                ))}
              </div>
              <h2 className="text-h3 font-semibold">{post.title}</h2>
              <p className="text-sm text-muted">{post.description}</p>
              <p className="mt-auto text-xs text-muted">
                <time dateTime={post.date}>{post.date}</time> ·{" "}
                {t("minutesRead", { minutes: post.minutes })}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
