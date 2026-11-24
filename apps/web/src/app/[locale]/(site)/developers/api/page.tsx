import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { PageHero } from "@/components/ui/page-hero";
import { mergeSamples } from "@/content/api-samples";
import { API_CHANGELOG, ENDPOINT_GROUPS, ERROR_CODES } from "@/content/api-reference";
import { siteUrl } from "@/config/site";
import { initPage, pageMetadata } from "@/lib/page";
import { cn } from "@/lib/utils";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-info-subtle text-info-strong",
  POST: "bg-success-subtle text-success-strong",
  PATCH: "bg-warning-subtle text-warning-strong",
  PUT: "bg-warning-subtle text-warning-strong",
  DELETE: "bg-danger-subtle text-danger-strong",
  HEAD: "bg-surface-muted text-muted",
};

const SECTION_KEYS = [
  ["authentication", "authentication"],
  ["quickstart", "quickstart"],
  ["rate-limits", "rateLimits"],
  ["scopes", "scopes"],
  ["webhooks", "webhooks"],
  ["sdks", "sdks"],
  ["errors", "errors"],
  ["changelog", "changelog"],
] as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/developers/api">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "apiPage" });
  return pageMetadata(locale, "/developers/api", t("metaTitle"), t("metaDescription"));
}

function Heading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-h2 font-bold tracking-tight">
      <a href={`#${id}`} className="hover:text-primary">
        {children}
      </a>
    </h2>
  );
}

export default async function ApiReferencePage({ params }: PageProps<"/[locale]/developers/api">) {
  const { locale } = await initPage(params);
  const t = await getTranslations();
  const page = await getTranslations("apiPage");
  const sections = [
    ...SECTION_KEYS.slice(0, 2).map(([id, key]) => ({ id, title: page(`sections.${key}`) })),
    ...ENDPOINT_GROUPS.map((group) => ({ id: group.id, title: group.title })),
    ...SECTION_KEYS.slice(2).map(([id, key]) => ({ id, title: page(`sections.${key}`) })),
  ];
  const code = (chunks: React.ReactNode) => <code className="font-mono">{chunks}</code>;
  return (
    <>
      <PageHero
        title={page("metaTitle")}
        subtitle={page("subtitle", { url: siteUrl })}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("nav.developers"), href: "/developers" },
          { label: page("metaTitle") },
        ]}
      />
      <div className="container-page grid gap-10 py-12 lg:grid-cols-[14rem_1fr]">
        <nav aria-label={t("common.onThisPage")} className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {t("common.onThisPage")}
          </p>
          <ul className="flex flex-wrap gap-1 text-sm lg:flex-col">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="block rounded-lg px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-14">
          <section className="flex flex-col gap-4">
            <Heading id="authentication">{page("sections.authentication")}</Heading>
            {locale === "ur" ? <p className="text-sm text-muted">{page("englishOnly")}</p> : null}
            <p className="text-muted">{page("authBody")}</p>
            <CodeBlock
              samples={[
                { id: "auth", label: "HTTP", code: "Authorization: Bearer pnk_your_api_key" },
              ]}
            />
          </section>
          <section className="flex flex-col gap-4">
            <Heading id="quickstart">{page("sections.quickstart")}</Heading>
            <p className="text-muted">{page("quickBody")}</p>
            <CodeBlock samples={mergeSamples()} />
            <p className="text-sm text-muted">
              {page("quickDocs")}{" "}
              <a href="/docs" className="font-medium text-primary underline">
                /docs
              </a>{" "}
              {page("quickSpec")}{" "}
              <a href="/openapi.json" className="font-medium text-primary underline">
                /openapi.json
              </a>
              .
            </p>
          </section>
          {ENDPOINT_GROUPS.map((group) => (
            <section key={group.id} className="flex flex-col gap-4">
              <Heading id={group.id}>{group.title}</Heading>
              <p className="text-muted">{group.description}</p>
              <ul className="divide-y divide-border overflow-hidden rounded-(--radius-card) border border-border bg-surface">
                {group.endpoints.map((endpoint) => (
                  <li
                    key={`${endpoint.method} ${endpoint.path}`}
                    className="flex flex-col gap-1.5 p-4 sm:flex-row sm:items-start sm:gap-4"
                  >
                    <span
                      className={cn(
                        "w-16 shrink-0 rounded-md px-2 py-0.5 text-center font-mono text-xs font-semibold",
                        METHOD_COLORS[endpoint.method],
                      )}
                    >
                      {endpoint.method}
                    </span>
                    <div className="min-w-0 flex-1">
                      <code className="font-mono text-sm break-all" dir="ltr">
                        {endpoint.path}
                      </code>
                      <p className="mt-1 text-sm text-muted">{endpoint.summary}</p>
                    </div>
                    {endpoint.auth === "required" ? (
                      <Badge tone="warning">{page("authRequired")}</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section className="flex flex-col gap-4">
            <Heading id="rate-limits">{page("sections.rateLimits")}</Heading>
            <p className="text-muted">{page.rich("rateBody", { code })}</p>
            <CodeBlock
              samples={[
                {
                  id: "limit",
                  label: "429 response",
                  code: `{
  "error": {
    "code": "fair_use_limit",
    "message": "You've started 120 tasks in the last hour, which is the fair-use limit. You can start new tasks again at 14:32 UTC.",
    "hint": "This limit keeps the service fast and free for everyone. It resets automatically.",
    "details": { "reason": "tasks_per_hour", "limit": 120, "reset_at": "2026-11-19T14:32:05+00:00", "retry_after": 1260 }
  }
}`,
                },
              ]}
            />
          </section>
          <section className="flex flex-col gap-4">
            <Heading id="scopes">{page("sections.scopes")}</Heading>
            <p className="text-muted">{page("scopesBody")}</p>
            <CodeBlock
              samples={[
                {
                  id: "scopes",
                  label: "Scopes",
                  code: "tasks:read  tasks:write      tasks, uploads, results\nlibrary:read  library:write  My files and team files\nesign:read  esign:write      signature requests you own\nteams:read  teams:write      teams you belong to\nwebhooks:manage              webhook endpoints",
                },
              ]}
            />
          </section>
          <section className="flex flex-col gap-4">
            <Heading id="webhooks">{page("sections.webhooks")}</Heading>
            <p className="text-muted">{page("webhooksBody")}</p>
            <CodeBlock
              samples={[
                {
                  id: "py",
                  label: "Python",
                  code: "import hashlib, hmac\n\ndef verify(secret, header, body: bytes) -> bool:\n    parts = dict(p.split('=', 1) for p in header.split(','))\n    signed = f\"{parts['t']}.\".encode() + body\n    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()\n    return hmac.compare_digest(expected, parts['v1'])",
                },
                {
                  id: "node",
                  label: "Node",
                  code: "import { createHmac, timingSafeEqual } from 'node:crypto';\n\nexport function verify(secret, header, body) {\n  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));\n  const expected = createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex');\n  return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));\n}",
                },
              ]}
            />
          </section>
          <section className="flex flex-col gap-4">
            <Heading id="sdks">{page("sections.sdks")}</Heading>
            <p className="text-muted">{page("sdksBody")}</p>
            <CodeBlock
              samples={[
                {
                  id: "cli",
                  label: "CLI",
                  code: "pip install pdfnova\nexport PDFNOVA_API_KEY=pnk_your_key\npdfnova run compress report.pdf -o out\npdfnova run rotate report.pdf -O angle=90",
                },
                {
                  id: "js",
                  label: "JavaScript",
                  code: "import { Client } from 'pdfnova';\n\nconst client = new Client(process.env.PDFNOVA_API_KEY);\nconst files = await client.run('rotate', ['report.pdf'], { angle: 90 });",
                },
              ]}
            />
          </section>
          <section className="flex flex-col gap-4">
            <Heading id="errors">{page("sections.errors")}</Heading>
            <p className="text-muted">{page("errorsBody")}</p>
            <div className="overflow-x-auto rounded-(--radius-card) border border-border">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-start">
                      {page("code")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-start">
                      {page("status")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-start">
                      {page("meaning")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {ERROR_CODES.map((error) => (
                    <tr key={error.code}>
                      <td className="px-4 py-3 font-mono text-xs">{error.code}</td>
                      <td className="px-4 py-3 font-mono text-xs">{error.status}</td>
                      <td className="px-4 py-3 text-muted">{error.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="flex flex-col gap-4">
            <Heading id="changelog">{page("sections.changelog")}</Heading>
            <ul className="flex flex-col gap-4">
              {API_CHANGELOG.map((entry) => (
                <li
                  key={entry.version}
                  className="rounded-(--radius-card) border border-border bg-surface p-5"
                >
                  <p className="font-mono text-sm font-semibold">
                    {entry.version} · {entry.date}
                  </p>
                  <ul className="mt-2 list-disc ps-5 text-sm text-muted">
                    {entry.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
