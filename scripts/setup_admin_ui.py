import json
import re
import shutil
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "apps" / "web"
SRC = WEB / "src"
APP = SRC / "app" / "[locale]"


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf8")


admin_lib = SRC / "lib" / "admin.ts"
text = admin_lib.read_text(encoding="utf8")
text = text.replace(
    "const ROOT = [\"admin\"] as const;",
    '''export type AdminAnalytics = {
  days: number;
  users: {
    total: number;
    verified: number;
    admins: number;
    new_in_period: number;
    new_this_week: number;
    active_this_week: number;
  };
  tasks: {
    total: number;
    in_period: number;
    succeeded: number;
    failed: number;
    success_rate: number | null;
    signed_in: number;
    guest: number;
    via_api: number;
    avg_seconds: number;
    p95_seconds: number;
    input_bytes: number;
    output_bytes: number;
  };
  ai_requests: number;
  open_reports: number;
  series: { date: string; tasks: number; failed: number; signups: number }[];
  top_tools: { tool: string; total: number }[];
  categories: { category: string; total: number }[];
  unused_tools: string[];
  recent_users: { id: string; email: string; display_name: string; created_at: string }[];
};

const ROOT = ["admin"] as const;''',
    1,
)
text = text.replace(
    "export const useJobMetrics",
    '''export const useAnalytics = (days: number) =>
  useQuery({
    queryKey: [...ROOT, "analytics", days],
    queryFn: () => apiJson<AdminAnalytics>(`/api/v1/admin/analytics?days=${days}`),
    refetchInterval: 60000,
  });
export const useJobMetrics''',
    1,
)
admin_lib.write_text(text, encoding="utf8")

page = SRC / "components" / "admin" / "admin-page.tsx"
text = page.read_text(encoding="utf8")
start = text.index("const TABS = [")
end = text.index("function Overview()")
text = text[:start] + text[end:]
cut = text.index("export function AdminPage()")
text = text[:cut].rstrip() + "\n"
for name in ["Overview", "Failures", "Users", "Flags", "FairUseEditor", "Abuse", "AnnouncementEditor"]:
    text = text.replace(f"\nfunction {name}()", f"\nexport function {name}()", 1)
text = text.replace('import { Callout, EmptyState } from "@/components/ui/blocks";', 'import { Callout } from "@/components/ui/blocks";')
text = text.replace('import { Link2, Megaphone, Save, ShieldAlert, X } from "lucide-react";', "")
text = text.replace('import { Check, Link2, Megaphone, Save, ShieldAlert, X } from "lucide-react";', 'import { Check, Link2, Megaphone, Save, X } from "lucide-react";')
text = text.replace('import { useSession } from "@/lib/session";\n', "")
page.write_text(text, encoding="utf8")

old_site_admin = APP / "(site)" / "admin"
if old_site_admin.exists():
    shutil.rmtree(old_site_admin)

write(
    SRC / "components" / "admin" / "admin-title.tsx",
    '''import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function adminMetadata(locale: string, key: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "adminPanel" });
  return { title: `${t("prefix")} · ${t(`nav.${key}`)}`, robots: { index: false, follow: false } };
}

export async function AdminTitle({ navKey }: { navKey: string }) {
  const t = await getTranslations("adminPanel");
  return (
    <h1 className="font-display text-2xl font-semibold">
      <span className="text-primary">{t("prefix")}</span> · {t(`nav.${navKey}`)}
    </h1>
  );
}
''',
)

write(
    APP / "(admin)" / "admin" / "layout.tsx",
    '''import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminRootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return children;
}
''',
)

write(
    APP / "(admin)" / "admin" / "login" / "page.tsx",
    '''import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminLogin } from "@/components/admin/admin-login";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "adminPanel" });
  return { title: `${t("prefix")} · ${t("login.title")}`, robots: { index: false, follow: false } };
}

export default async function AdminLoginPage({ params }: PageProps<"/[locale]/admin/login">) {
  await initPage(params);
  return <AdminLogin />;
}
''',
)

write(
    APP / "(admin)" / "admin" / "(panel)" / "layout.tsx",
    '''import { setRequestLocale } from "next-intl/server";

import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminPanelLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminShell>{children}</AdminShell>;
}
''',
)

PAGES = {
    "": ("dashboard", "Dashboard", ["Dashboard"], '"@/components/admin/analytics"'),
    "users": ("users", "Users", ["Users"], '"@/components/admin/admin-page"'),
    "tools": ("tools", "ToolUsage", ["ToolUsage"], '"@/components/admin/analytics"'),
    "jobs": ("jobs", "Failures", ["Failures"], '"@/components/admin/admin-page"'),
    "reports": ("reports", "Abuse", ["Abuse"], '"@/components/admin/admin-page"'),
    "system": ("system", "Overview", ["Overview"], '"@/components/admin/admin-page"'),
}
for route, (key, component, imports, module) in PAGES.items():
    route_type = f"/[locale]/admin/{route}" if route else "/[locale]/admin"
    name = (route or "dashboard").capitalize()
    write(
        APP / "(admin)" / "admin" / "(panel)" / route / "page.tsx" if route else APP / "(admin)" / "admin" / "(panel)" / "page.tsx",
        f'''import type {{ Metadata }} from "next";

import {{ AdminTitle, adminMetadata }} from "@/components/admin/admin-title";
import {{ {", ".join(imports)} }} from {module};
import {{ initPage }} from "@/lib/page";

export async function generateMetadata({{
  params,
}}: PageProps<"{route_type}">): Promise<Metadata> {{
  const {{ locale }} = await params;
  return adminMetadata(locale, "{key}");
}}

export default async function Admin{name}Page({{ params }}: PageProps<"{route_type}">) {{
  await initPage(params);
  return (
    <>
      <AdminTitle navKey="{key}" />
      <{component} />
    </>
  );
}}
''',
    )

write(
    APP / "(admin)" / "admin" / "(panel)" / "settings" / "page.tsx",
    '''import type { Metadata } from "next";

import { AdminTitle, adminMetadata } from "@/components/admin/admin-title";
import { AnnouncementEditor, FairUseEditor, Flags } from "@/components/admin/admin-page";
import { initPage } from "@/lib/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/settings">): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, "settings");
}

export default async function AdminSettingsPage({ params }: PageProps<"/[locale]/admin/settings">) {
  await initPage(params);
  return (
    <>
      <AdminTitle navKey="settings" />
      <Flags />
      <FairUseEditor />
      <AnnouncementEditor />
    </>
  );
}
''',
)

routes = SRC / "config" / "routes.ts"
text = routes.read_text(encoding="utf8")
text = text.replace(
    '  "/admin",\n',
    '  "/admin",\n  "/admin/login",\n  "/admin/users",\n  "/admin/tools",\n  "/admin/jobs",\n  "/admin/reports",\n  "/admin/settings",\n  "/admin/system",\n',
    1,
)
routes.write_text(text, encoding="utf8")

EN = {
    "prefix": "Admin",
    "console": "Admin console",
    "signOut": "Sign out",
    "backToSite": "Back to the website",
    "noAccessTitle": "Admins only",
    "noAccessBody": "This account is not an administrator. Sign out and use an admin account.",
    "loadFailed": "The admin data could not be loaded.",
    "noData": "No data yet.",
    "range": "Time range",
    "lastDays": "Last {days} days",
    "dashboardNote": "Live numbers from the database. Guest and signed-in tasks are both counted.",
    "toolsNote": "How often each tool ran, how often it worked and how long it took.",
    "unusedHint": "These tools did not run once in this period. Keep them, or move them to an advanced section later.",
    "nav": {
        "dashboard": "Dashboard",
        "users": "Users",
        "tools": "Tool usage",
        "jobs": "Jobs and failures",
        "reports": "Abuse reports",
        "settings": "Settings",
        "system": "System health",
    },
    "login": {
        "title": "Admin sign in",
        "subtitle": "Only administrators can sign in here.",
        "email": "Admin email",
        "password": "Password",
        "submit": "Sign in to admin",
        "mfaTitle": "Two-step verification",
        "mfaSubtitle": "Enter the code from your authenticator app or a recovery code.",
        "code": "Verification code",
        "verify": "Verify and continue",
        "notice": "Accounts without admin rights are refused.",
    },
    "stats": {
        "users": "Total users",
        "usersHint": "{verified} verified, {admins} admins",
        "newUsers": "New users",
        "newWeek": "{count} in the last 7 days",
        "activeUsers": "Active users",
        "activeHint": "Signed in during the last 7 days",
        "openReports": "Open abuse reports",
        "tasks": "Tasks in this period",
        "tasksAll": "{count} all time",
        "successRate": "Success rate",
        "failedCount": "{count} failed",
        "avgTime": "Average run time",
        "p95": "95th percentile {seconds}s",
        "dataProcessed": "Data processed",
        "dataOut": "{size} produced",
        "guestTasks": "Guest tasks",
        "signedInTasks": "{count} by signed-in users",
        "apiTasks": "Tasks through the API",
        "aiRequests": "AI requests",
        "toolsUnused": "Tools never used",
        "toolsUnusedHint": "In the last {days} days",
    },
    "charts": {
        "tasks": "Tasks per day",
        "failedNote": "{count} tasks failed in this period.",
        "signups": "New users per day",
        "topTools": "Most used tools",
        "categories": "Usage by category",
        "recentUsers": "Newest users",
        "unusedTools": "Tools not used in the last {days} days",
    },
    "cols": {
        "tool": "Tool",
        "total": "Runs",
        "succeeded": "Succeeded",
        "failed": "Failed",
        "successRate": "Success rate",
        "avg": "Average time",
        "p95": "95th percentile",
    },
}
UR = {
    "prefix": "ایڈمن",
    "console": "ایڈمن کنسول",
    "signOut": "سائن آؤٹ",
    "backToSite": "ویب سائٹ پر واپس",
    "noAccessTitle": "صرف ایڈمن کے لیے",
    "noAccessBody": "یہ اکاؤنٹ ایڈمن نہیں ہے۔ سائن آؤٹ کریں اور ایڈمن اکاؤنٹ استعمال کریں۔",
    "loadFailed": "ایڈمن ڈیٹا لوڈ نہیں ہو سکا۔",
    "noData": "ابھی کوئی ڈیٹا نہیں۔",
    "range": "وقت کی حد",
    "lastDays": "پچھلے {days} دن",
    "dashboardNote": "ڈیٹا بیس سے براہ راست اعداد و شمار۔ مہمان اور سائن اِن دونوں کے کام شمار ہوتے ہیں۔",
    "toolsNote": "ہر ٹول کتنی بار چلا، کتنی بار کامیاب رہا اور کتنا وقت لگا۔",
    "unusedHint": "یہ ٹولز اس مدت میں ایک بار بھی نہیں چلے۔ انہیں رکھیں، یا بعد میں ایڈوانسڈ حصے میں منتقل کریں۔",
    "nav": {
        "dashboard": "ڈیش بورڈ",
        "users": "صارفین",
        "tools": "ٹول کا استعمال",
        "jobs": "کام اور ناکامیاں",
        "reports": "غلط استعمال کی رپورٹیں",
        "settings": "ترتیبات",
        "system": "سسٹم کی صحت",
    },
    "login": {
        "title": "ایڈمن سائن اِن",
        "subtitle": "یہاں صرف ایڈمن سائن اِن کر سکتے ہیں۔",
        "email": "ایڈمن ای میل",
        "password": "پاس ورڈ",
        "submit": "ایڈمن میں سائن اِن کریں",
        "mfaTitle": "دو مرحلہ توثیق",
        "mfaSubtitle": "اپنی آتھنٹیکیٹر ایپ کا کوڈ یا ریکوری کوڈ درج کریں۔",
        "code": "توثیقی کوڈ",
        "verify": "تصدیق کریں اور آگے بڑھیں",
        "notice": "ایڈمن حقوق کے بغیر اکاؤنٹس کو انکار کر دیا جاتا ہے۔",
    },
    "stats": {
        "users": "کل صارفین",
        "usersHint": "{verified} تصدیق شدہ، {admins} ایڈمن",
        "newUsers": "نئے صارفین",
        "newWeek": "پچھلے 7 دنوں میں {count}",
        "activeUsers": "فعال صارفین",
        "activeHint": "پچھلے 7 دنوں میں سائن اِن ہوئے",
        "openReports": "کھلی رپورٹیں",
        "tasks": "اس مدت کے کام",
        "tasksAll": "کل ملا کر {count}",
        "successRate": "کامیابی کی شرح",
        "failedCount": "{count} ناکام",
        "avgTime": "اوسط وقت",
        "p95": "95 فیصد کام {seconds} سیکنڈ میں",
        "dataProcessed": "پروسیس شدہ ڈیٹا",
        "dataOut": "{size} تیار ہوا",
        "guestTasks": "مہمان کے کام",
        "signedInTasks": "{count} سائن اِن صارفین کے",
        "apiTasks": "API کے ذریعے کام",
        "aiRequests": "AI درخواستیں",
        "toolsUnused": "کبھی استعمال نہ ہونے والے ٹولز",
        "toolsUnusedHint": "پچھلے {days} دنوں میں",
    },
    "charts": {
        "tasks": "روزانہ کام",
        "failedNote": "اس مدت میں {count} کام ناکام ہوئے۔",
        "signups": "روزانہ نئے صارفین",
        "topTools": "سب سے زیادہ استعمال ہونے والے ٹولز",
        "categories": "زمرے کے لحاظ سے استعمال",
        "recentUsers": "تازہ ترین صارفین",
        "unusedTools": "پچھلے {days} دنوں میں استعمال نہ ہونے والے ٹولز",
    },
    "cols": {
        "tool": "ٹول",
        "total": "بار چلا",
        "succeeded": "کامیاب",
        "failed": "ناکام",
        "successRate": "کامیابی کی شرح",
        "avg": "اوسط وقت",
        "p95": "95 فیصد",
    },
}
for locale, value in (("en", EN), ("ur", UR)):
    file = WEB / "messages" / f"{locale}.json"
    messages = json.loads(file.read_text(encoding="utf8"))
    messages["adminPanel"] = value
    file.write_text(json.dumps(messages, ensure_ascii=False, indent=2) + "\n", encoding="utf8")

robots = SRC / "app" / "robots.ts"
text = robots.read_text(encoding="utf8")
text = text.replace('"/api/", "/auth/",', '"/api/", "/auth/", "/admin",', 1)
robots.write_text(text, encoding="utf8")
print("done")
