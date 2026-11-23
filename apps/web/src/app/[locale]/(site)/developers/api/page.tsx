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

const SECTIONS = [
  { id: "authentication", title: "Authentication" },
  { id: "quickstart", title: "Quickstart" },
  ...ENDPOINT_GROUPS.map((group) => ({ id: group.id, title: group.title })),
  { id: "rate-limits", title: "Rate limits" },
  { id: "scopes", title: "Key scopes" },
  { id: "webhooks", title: "Webhooks" },
  { id: "sdks", title: "SDKs and CLI" },
  { id: "errors", title: "Errors" },
  { id: "changelog", title: "API changelog" },
];

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/developers/api">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(
    locale,
    "/developers/api",
    "API reference",
    "Endpoints, authentication, examples, rate limits and error codes for the REST API.",
  );
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
  await initPage(params);
  const t = await getTranslations();
  return (
    <>
      <PageHero
        title="API reference"
        subtitle={`Base URL ${siteUrl}/api/v1. Every tool on the site is available here, free, with fair-use limits.`}
        breadcrumbs={[
          { label: t("common.home"), href: "/" },
          { label: t("nav.developers"), href: "/developers" },
          { label: "API reference" },
        ]}
      />
      <div className="container-page grid gap-10 py-12 lg:grid-cols-[14rem_1fr]">
        <nav aria-label={t("common.onThisPage")} className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {t("common.onThisPage")}
          </p>
          <ul className="flex flex-wrap gap-1 text-sm lg:flex-col">
            {SECTIONS.map((section) => (
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
            <Heading id="authentication">Authentication</Heading>
            <p className="text-muted">
              Send an API key as a Bearer token. Create keys in your dashboard. Requests made with
              an API key don’t need CSRF tokens. Without a key, requests are treated as a guest
              session tied to a cookie.
            </p>
            <CodeBlock
              samples={[
                { id: "auth", label: "HTTP", code: "Authorization: Bearer pnk_your_api_key" },
              ]}
            />
          </section>
          <section className="flex flex-col gap-4">
            <Heading id="quickstart">Quickstart</Heading>
            <p className="text-muted">
              Create a task, add files, start it and read the download link. Download links are
              signed and expire after 15 minutes.
            </p>
            <CodeBlock samples={mergeSamples()} />
            <p className="text-sm text-muted">
              The full interactive OpenAPI reference is at{" "}
              <a href="/docs" className="font-medium text-primary underline">
                /docs
              </a>{" "}
              and the specification at{" "}
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
                      <Badge tone="warning">Auth required</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section className="flex flex-col gap-4">
            <Heading id="rate-limits">Rate limits</Heading>
            <p className="text-muted">
              Every caller shares the same public fair-use policy, available at{" "}
              <code className="font-mono">/api/v1/fair-use</code>. Your current usage and reset
              times are at <code className="font-mono">/api/v1/usage</code>. When a limit is reached
              the API responds with status 429, a Retry-After header and{" "}
              <code className="font-mono">details.reset_at</code>.
            </p>
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
            <Heading id="scopes">Key scopes</Heading>
            <p className="text-muted">
              Choose what a key may do when you create it. A key without a needed scope receives a
              403 response. Keys can never change your account settings or create other keys.
              Write scopes include the matching read scope.
            </p>
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
            <Heading id="webhooks">Webhooks</Heading>
            <p className="text-muted">
              Add an https endpoint in your dashboard and pick events: task.succeeded, task.failed,
              esign.completed and esign.declined. Each delivery is a JSON POST signed with your
              endpoint secret in the X-PDFNova-Signature header (t=timestamp,v1=hex HMAC-SHA256 of
              “timestamp.body”). Failed deliveries are retried after 30 seconds, 2 minutes, 10
              minutes, 1 hour and 6 hours, and every attempt appears in the delivery log.
            </p>
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
            <Heading id="sdks">SDKs and CLI</Heading>
            <p className="text-muted">
              Small official clients wrap upload, start, wait and download. The Python package also
              installs the pdfnova command. The full interactive reference is at /docs and the raw
              OpenAPI document at /openapi.json.
            </p>
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
            <Heading id="errors">Errors</Heading>
            <p className="text-muted">
              Every error uses the same envelope with a stable code, a human message and, where
              useful, a hint on how to fix it.
            </p>
            <div className="overflow-x-auto rounded-(--radius-card) border border-border">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-start">
                      Code
                    </th>
                    <th scope="col" className="px-4 py-3 text-start">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-start">
                      Meaning
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
            <Heading id="changelog">API changelog</Heading>
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
