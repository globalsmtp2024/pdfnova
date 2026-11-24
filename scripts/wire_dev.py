from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "app" / "[locale]" / "(site)" / "developers"


def edit(path, pairs):
    text = path.read_text(encoding="utf8")
    for old, new in pairs:
        assert old in text, (str(path), old[:60])
        text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf8")


def card(icon, title_en, key, color, extra=""):
    return None


dev = BASE / "page.tsx"
text = dev.read_text(encoding="utf8")
for key, title in [
    ("keys", "Free API keys"),
    ("uploads", "Resumable uploads"),
    ("progress", "Live progress"),
    ("limits", "Fair-use limits"),
    ("openapi", "OpenAPI"),
    ("webhooks", "Webhooks"),
    ("status", "Status"),
]:
    start = text.index(f'title="{title}"')
    body_start = text.index("body=", start)
    body_end = text.index('"\n', body_start + 6) + 1
    text = text[:start] + f'title={{page("{key}.title")}}' + text[start + len(f'title="{title}"'):body_start] + f'body={{page("{key}.body")}}' + text[body_end:]
dev.write_text(text, encoding="utf8")

edit(dev, [
    ('  return pageMetadata(locale, "/developers", "Developers", t("subtitle"));',
     '  const page = await getTranslations({ locale, namespace: "devPage" });\n  return pageMetadata(locale, "/developers", page("metaTitle"), t("subtitle"));'),
    ("  await initPage(params);\n  const t = await getTranslations();", '  await initPage(params);\n  const t = await getTranslations();\n  const page = await getTranslations("devPage");'),
    ('<SectionHeader title="Built for real integrations" />', '<SectionHeader title={page("built")} />'),
    ('<SectionHeader title="Merge two PDFs in three languages" />', '<SectionHeader title={page("samples")} />'),
])

api = BASE / "api" / "page.tsx"
edit(api, [
    ('const SECTIONS = [\n  { id: "authentication", title: "Authentication" },\n  { id: "quickstart", title: "Quickstart" },\n  ...ENDPOINT_GROUPS.map((group) => ({ id: group.id, title: group.title })),\n  { id: "rate-limits", title: "Rate limits" },\n  { id: "scopes", title: "Key scopes" },\n  { id: "webhooks", title: "Webhooks" },\n  { id: "sdks", title: "SDKs and CLI" },\n  { id: "errors", title: "Errors" },\n  { id: "changelog", title: "API changelog" },\n];\n',
     'const SECTION_KEYS = [\n  ["authentication", "authentication"],\n  ["quickstart", "quickstart"],\n  ["rate-limits", "rateLimits"],\n  ["scopes", "scopes"],\n  ["webhooks", "webhooks"],\n  ["sdks", "sdks"],\n  ["errors", "errors"],\n  ["changelog", "changelog"],\n] as const;\n'),
    ('  const { locale } = await params;\n  return pageMetadata(\n    locale,\n    "/developers/api",\n    "API reference",\n    "Endpoints, authentication, examples, rate limits and error codes for the REST API.",\n  );',
     '  const { locale } = await params;\n  const t = await getTranslations({ locale, namespace: "apiPage" });\n  return pageMetadata(locale, "/developers/api", t("metaTitle"), t("metaDescription"));'),
    ("  await initPage(params);\n  const t = await getTranslations();\n  return (",
     '  const { locale } = await initPage(params);\n  const t = await getTranslations();\n  const page = await getTranslations("apiPage");\n  const sections = [\n    ...SECTION_KEYS.slice(0, 2).map(([id, key]) => ({ id, title: page(`sections.${key}`) })),\n    ...ENDPOINT_GROUPS.map((group) => ({ id: group.id, title: group.title })),\n    ...SECTION_KEYS.slice(2).map(([id, key]) => ({ id, title: page(`sections.${key}`) })),\n  ];\n  const code = (chunks: React.ReactNode) => <code className="font-mono">{chunks}</code>;\n  return ('),
    ('title="API reference"\n        subtitle={`Base URL ${siteUrl}/api/v1. Every tool on the site is available here, free, with fair-use limits.`}',
     'title={page("metaTitle")}\n        subtitle={page("subtitle", { url: siteUrl })}'),
    ('{ label: "API reference" }', '{ label: page("metaTitle") }'),
    ("{SECTIONS.map((section) => (", "{sections.map((section) => ("),
    ('<Heading id="authentication">Authentication</Heading>\n            <p className="text-muted">\n              Send an API key as a Bearer token. Create keys in your dashboard. Requests made with\n              an API key don’t need CSRF tokens. Without a key, requests are treated as a guest\n              session tied to a cookie.\n            </p>',
     '<Heading id="authentication">{page("sections.authentication")}</Heading>\n            {locale === "ur" ? <p className="text-sm text-muted">{page("englishOnly")}</p> : null}\n            <p className="text-muted">{page("authBody")}</p>'),
    ('<Heading id="quickstart">Quickstart</Heading>\n            <p className="text-muted">\n              Create a task, add files, start it and read the download link. Download links are\n              signed and expire after 15 minutes.\n            </p>',
     '<Heading id="quickstart">{page("sections.quickstart")}</Heading>\n            <p className="text-muted">{page("quickBody")}</p>'),
    ("              The full interactive OpenAPI reference is at{\" \"}", "              {page(\"quickDocs\")}{\" \"}"),
    ("              </a>{\" \"}\n              and the specification at{\" \"}", "              </a>{\" \"}\n              {page(\"quickSpec\")}{\" \"}"),
    ('<Heading id="rate-limits">Rate limits</Heading>', '<Heading id="rate-limits">{page("sections.rateLimits")}</Heading>'),
    ('<p className="text-muted">\n              Every caller shares the same public fair-use policy, available at{" "}\n              <code className="font-mono">/api/v1/fair-use</code>. Your current usage and reset\n              times are at <code className="font-mono">/api/v1/usage</code>. When a limit is reached\n              the API responds with status 429, a Retry-After header and{" "}\n              <code className="font-mono">details.reset_at</code>.\n            </p>',
     '<p className="text-muted">{page.rich("rateBody", { code })}</p>'),
    ('<Heading id="scopes">Key scopes</Heading>\n            <p className="text-muted">\n              Choose what a key may do when you create it. A key without a needed scope receives a\n              403 response. Keys can never change your account settings or create other keys. Write\n              scopes include the matching read scope.\n            </p>',
     '<Heading id="scopes">{page("sections.scopes")}</Heading>\n            <p className="text-muted">{page("scopesBody")}</p>'),
    ('<Heading id="webhooks">Webhooks</Heading>', '<Heading id="webhooks">{page("sections.webhooks")}</Heading>'),
    ('<p className="text-muted">\n              Add an https endpoint in your dashboard and pick events: task.succeeded, task.failed,\n              esign.completed and esign.declined. Each delivery is a JSON POST signed with your\n              endpoint secret in the X-PDFNova-Signature header (t=timestamp,v1=hex HMAC-SHA256 of\n              “timestamp.body”). Failed deliveries are retried after 30 seconds, 2 minutes, 10\n              minutes, 1 hour and 6 hours, and every attempt appears in the delivery log.\n            </p>',
     '<p className="text-muted">{page("webhooksBody")}</p>'),
    ('<Heading id="sdks">SDKs and CLI</Heading>\n            <p className="text-muted">\n              Small official clients wrap upload, start, wait and download. The Python package also\n              installs the pdfnova command. The full interactive reference is at /docs and the raw\n              OpenAPI document at /openapi.json.\n            </p>',
     '<Heading id="sdks">{page("sections.sdks")}</Heading>\n            <p className="text-muted">{page("sdksBody")}</p>'),
    ('<Heading id="errors">Errors</Heading>\n            <p className="text-muted">\n              Every error uses the same envelope with a stable code, a human message and, where\n              useful, a hint on how to fix it.\n            </p>',
     '<Heading id="errors">{page("sections.errors")}</Heading>\n            <p className="text-muted">{page("errorsBody")}</p>'),
    ("                      Code\n", '                      {page("code")}\n'),
    ("                      Status\n", '                      {page("status")}\n'),
    ("                      Meaning\n", '                      {page("meaning")}\n'),
    ('<Heading id="changelog">API changelog</Heading>', '<Heading id="changelog">{page("sections.changelog")}</Heading>'),
    ('<Badge tone="warning">Auth required</Badge>', '<Badge tone="warning">{page("authRequired")}</Badge>'),
])
