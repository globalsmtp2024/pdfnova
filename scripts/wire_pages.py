from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "apps" / "web"
BASE = WEB / "src" / "app" / "[locale]" / "(site)"


def edit(path: Path, pairs):
    text = path.read_text(encoding="utf8")
    for old, new in pairs:
        assert old in text, (str(path), old[:60])
        text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf8")


def meta(route, namespace, title="metaTitle", desc="subtitle"):
    return (
        "  const { locale } = await params;\n"
        f'  const t = await getTranslations({{ locale, namespace: "sitePages.{namespace}" }});\n'
        f'  return pageMetadata(locale, "{route}", t("{title}"), t("{desc}"));'
    )


def init(namespace):
    return (
        "  const { locale } = await initPage(params);\n  const t = await getTranslations();\n"
        f'  const page = await getTranslations("sitePages.{namespace}");'
    )


OLD_INIT = "  await initPage(params);\n  const t = await getTranslations();"
OLD_META = "  const { locale } = await params;\n  return pageMetadata("

edit(BASE / "security/page.tsx", [
    ('import { LIFECYCLE, PROTECTIONS } from "@/content/pages";',
     'import { localizedLifecycle, localizedProtections } from "@/content/pages";'),
    ('const TITLE = "Security and privacy, explained plainly";\nconst SUBTITLE =\n  "These are the protections that are built and running today. We don’t claim certifications we don’t have.";\n\n', ""),
    ('  const { locale } = await params;\n  return pageMetadata(locale, "/security", "Security and privacy", SUBTITLE);', meta("/security", "security")),
    (OLD_INIT, init("security")),
    ("title={TITLE}\n        subtitle={SUBTITLE}", 'title={page("title")}\n        subtitle={page("subtitle")}'),
    ("{PROTECTIONS.map", "{localizedProtections(locale).map"),
    ("{LIFECYCLE.map", "{localizedLifecycle(locale).map"),
    ('title="The auto-deletion timeline"\n          subtitle="Every file follows the same short lifecycle."',
     'title={page("timelineTitle")}\n          subtitle={page("timelineSubtitle")}'),
    ('<Callout tone="info" title="Found a vulnerability?">\n          Please report it privately through the{" "}\n          <Link href="/contact" className="font-medium underline">\n            contact form\n          </Link>{" "}\n          with the topic Security report. We appreciate responsible disclosure.',
     '<Callout tone="info" title={page("reportTitle")}>\n          {page("reportBefore")}{" "}\n          <Link href="/contact" className="font-medium underline">\n            {page("reportLink")}\n          </Link>{" "}\n          {page("reportAfter")}'),
])

edit(BASE / "about/page.tsx", [
    ('import { PRINCIPLES } from "@/content/pages";', 'import { localizedPrinciples } from "@/content/pages";'),
    ('const SUBTITLE =\n  "Documents shouldn’t be a chore, and fixing them shouldn’t cost money. That’s the whole idea.";\n\n', ""),
    ('  const { locale } = await params;\n  return pageMetadata(locale, "/about", "About", SUBTITLE);', meta("/about", "about")),
    (OLD_INIT, init("about")),
    ("title={`Why ${brand.name} exists`}\n        subtitle={SUBTITLE}", 'title={page("title", { brand: brand.name })}\n        subtitle={page("subtitle")}'),
    ('<SectionHeader title="Our mission" />', '<SectionHeader title={page("missionTitle")} />'),
    ("<p>\n              Everyone handles documents: students submitting coursework, freelancers sending\n              contracts, small businesses filing receipts, schools sharing course packs. Too often\n              the tools are expensive, cluttered or careless with private files.\n            </p>\n            <p>\n              {brand.name} puts every document tool in one fast, calm place, free for everyone, with\n              privacy treated as a default rather than an upsell.\n            </p>",
     '<p>{page("missionOne")}</p>\n            <p>{page("missionTwo", { brand: brand.name })}</p>'),
    ('title="Principles we build by"', 'title={page("principlesTitle")}'),
    ("{PRINCIPLES.map", "{localizedPrinciples(locale).map"),
    ('title="How it stays free"', 'title={page("freeTitle")}'),
    ('<p>\n              Processing is efficient by design: files are handled by small, isolated workers and\n              deleted quickly, so storage costs stay low.\n            </p>\n            <p>\n              Fair-use limits stop abuse without getting in the way of normal use. They are public,\n              generous and the same for everyone.\n            </p>\n            <p>\n              Optional contributions help cover servers and development.{" "}',
     '<p>{page("freeOne")}</p>\n            <p>{page("freeTwo")}</p>\n            <p>\n              {page("freeThree")}{" "}'),
    ("                  Support the project", '                  {page("support")}'),
])

edit(BASE / "accessibility/page.tsx", [
    ('import { ACCESSIBILITY_COMMITMENTS } from "@/content/pages";', 'import { localizedCommitments } from "@/content/pages";'),
    ('const SUBTITLE =\n  "We aim to meet WCAG 2.2 level AA across the whole site. Here is what we do and how to tell us when we fall short.";\n\n', ""),
    ('  const { locale } = await params;\n  return pageMetadata(locale, "/accessibility", "Accessibility statement", SUBTITLE);', meta("/accessibility", "accessibility")),
    (OLD_INIT, init("accessibility")),
    ('title="Accessibility statement"\n        subtitle={SUBTITLE}', 'title={page("title")}\n        subtitle={page("subtitle")}'),
    ("{ACCESSIBILITY_COMMITMENTS.map", "{localizedCommitments(locale).map"),
    ('<Callout tone="info" title="Known limitations">\n            Some planned tools, such as the visual PDF editor, are not yet available. We will test\n            each one with keyboard and screen reader users before it ships.\n          </Callout>',
     '<Callout tone="info" title={page("limitsTitle")}>\n            {page("limitsBody")}\n          </Callout>'),
    ('            If something on {brand.name} is hard to use with your assistive technology, please tell\n            us through the{" "}\n            <Link href="/contact" className="font-medium text-primary underline">\n              contact form\n            </Link>\n            . We aim to respond within two working days. You can also see every keyboard shortcut on\n            the{" "}\n            <Link href="/shortcuts" className="font-medium text-primary underline">\n              shortcuts page\n            </Link>\n            .',
     '            {page("helpBefore", { brand: brand.name })}{" "}\n            <Link href="/contact" className="font-medium text-primary underline">\n              {page("contactLink")}\n            </Link>\n            {page("helpMiddle")}{" "}\n            <Link href="/shortcuts" className="font-medium text-primary underline">\n              {page("shortcutsLink")}\n            </Link>\n            .'),
])

edit(BASE / "compare/page.tsx", [
    ('import { COMPARE_ROWS } from "@/content/pages";', 'import { localizedCompareRows } from "@/content/pages";'),
    ('const SUBTITLE =\n  "An honest overview of what you get. No comparisons with other products, just facts you can check.";\n\n', ""),
    ('  const { locale } = await params;\n  return pageMetadata(locale, "/compare", "Overview", SUBTITLE);', meta("/compare", "compare")),
    (OLD_INIT, init("compare") + "\n  const rows = localizedCompareRows(locale);"),
    ("title={`${brand.name} at a glance`}\n        subtitle={SUBTITLE}", 'title={page("title", { brand: brand.name })}\n        subtitle={page("subtitle")}'),
    ("{`${brand.name} feature overview`}", '{page("caption", { brand: brand.name })}'),
    ("                  Feature\n", '                  {page("feature")}\n'),
    ("{COMPARE_ROWS.map((row) => (", "{rows.map((row, index) => ("),
    ('{row.feature === "Tools available today" ? (', "{index === rows.length - 1 ? ("),
    ("          The catalog lists {TOOLS.length} tools. Each one is marked Coming soon until it actually\n          works, and the changelog shows what shipped when.",
     '          {page("note", { count: TOOLS.length })}'),
])

edit(BASE / "help/page.tsx", [
    ('import { HELP_TOPICS } from "@/content/pages";', 'import { localizedHelpTopics } from "@/content/pages";'),
    ('  const { locale } = await params;\n  return pageMetadata(\n    locale,\n    "/help",\n    "Help center",\n    "Answers to common questions about tools, files, privacy, fair use and the API.",\n  );',
     meta("/help", "help", "metaTitle", "metaDescription")),
    (OLD_INIT, init("help")),
    ("HELP_TOPICS.flatMap", "localizedHelpTopics(locale).flatMap"),
    ('title="How can we help?"\n        subtitle="Search the answers below, or send us a message."', 'title={page("title")}\n        subtitle={page("subtitle")}'),
    ('<p className="text-muted">Still stuck?</p>', '<p className="text-muted">{page("stuck")}</p>'),
])

edit(BASE / "how-it-works/page.tsx", [
    ('const SUBTITLE =\n  "From the moment you drop a file to the moment it disappears, here is exactly what happens.";\n\n', ""),
    ('import { LIFECYCLE } from "@/content/pages";', 'import { localizedLifecycle } from "@/content/pages";'),
    ('  const { locale } = await params;\n  return pageMetadata(locale, "/how-it-works", "How it works", SUBTITLE);', meta("/how-it-works", "howItWorks")),
    (OLD_INIT, init("howItWorks")),
    ("subtitle={SUBTITLE}", 'subtitle={page("subtitle")}'),
    ("{LIFECYCLE.map", "{localizedLifecycle(locale).map"),
])

edit(BASE / "features/page.tsx", [
    ('import { FEATURES } from "@/content/pages";', 'import { localizedFeatures } from "@/content/pages";'),
    ('const TITLE = "Everything the platform can do";\nconst SUBTITLE =\n  "A free, private document platform built for speed, batches and automation, with an API for everything.";\n\n', ""),
    ('  const { locale } = await params;\n  return pageMetadata(locale, "/features", "Features", SUBTITLE);', meta("/features", "features")),
    (OLD_INIT, init("features")),
    ("title={TITLE}\n        subtitle={SUBTITLE}", 'title={page("title")}\n        subtitle={page("subtitle")}'),
    ("{FEATURES.map", "{localizedFeatures(locale).map"),
])

edit(WEB / "src/components/help-center.tsx", [
    ('import { useTranslations } from "next-intl";', 'import { useLocale, useTranslations } from "next-intl";'),
    ('import { HELP_TOPICS } from "@/content/pages";', 'import { localizedHelpTopics } from "@/content/pages";'),
    ('  const t = useTranslations("common");\n', '  const t = useTranslations("common");\n  const page = useTranslations("sitePages.help");\n  const locale = useLocale();\n'),
    ("return HELP_TOPICS.map", "return localizedHelpTopics(locale).map"),
    ("  }, [query]);", "  }, [query, locale]);"),
    ('placeholder="Search help articles"', 'placeholder={page("searchPlaceholder")}'),
    ('title={`No answers match “${query}”.`}\n          body="Try different words, or contact us and a person will help."', 'title={page("noMatch", { query })}\n          body={page("noMatchBody")}'),
])

edit(BASE / "categories/[category]/page.tsx", [
    ('import { CATEGORY_FAQ } from "@/content/pages";', 'import { localizedCategoryFaq } from "@/content/pages";'),
    ("CATEGORY_FAQ[category.id].map", "localizedCategoryFaq(locale, category.id).map"),
])
