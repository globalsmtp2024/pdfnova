import { readFileSync, writeFileSync } from "node:fs";

const ADDITIONS = {
  adminPanel: [
    {
      table: {
        showing: "Showing {from}-{to} of {total}",
        rows: "Rows",
        page: "Page {current} of {pages}",
        previous: "Previous page",
        next: "Next page",
      },
      search: {
        label: "Search the admin area",
        placeholder: "Search users, pages and tools",
        none: "Nothing found.",
        group: { users: "Users", pages: "Pages", tools: "Tools" },
      },
      profile: { role: "Administrator", account: "My account settings" },
      toolsPage: {
        runs: "Total runs",
        used: "Tools used",
        slowest: "Slowest tool",
        worst: "Lowest success: {name}",
      },
      failures: {
        when: "When",
        code: "Error code",
        who: "Who",
        size: "Input size",
        message: "Message",
        shown: "Failures shown",
        shownHint: "After your filters",
        topTool: "Most failing tool",
        topCode: "Most common error",
        times: "{count} times",
      },
      reports: {
        kind: "Type",
        target: "Target",
        reason: "Reason",
        source: "Reported by",
        actions: "Action",
      },
      settings: {
        flagsOn: "Features switched on",
        hourlyLimit: "Tasks per hour limit",
        dailyLimit: "Tasks per day limit",
        perPerson: "Per person",
      },
      users: {
        detailTitle: "User details",
        never: "Never",
        twoStepOn: "Two-step on",
        twoStepOff: "Two-step off",
        locked: "Locked",
        admins: "Admins",
        empty: "No users match.",
        clickHint: "Click a row to open the full details.",
        tasksTotal: "Tasks, all time",
        tasksMonth: "Tasks, 30 days",
        account: "Account",
        joinedLabel: "Joined",
        lastSignIn: "Last sign-in",
        language: "Language",
        providers: "Sign-in methods",
        passwordOnly: "Password",
        aiProvider: "AI provider",
        none: "None",
        failedLogins: "Failed sign-ins",
        assets: "What this user owns",
        apiKeys: "API keys",
        webhooks: "Webhooks",
        teams: "Teams",
        files: "Saved files",
        schedules: "Schedules",
        sessions: "Open sessions",
        topTools: "Most used tools",
        recent: "Recent tasks",
        controls: "Account controls",
        controlsSub: "Changes apply immediately.",
      },
    },
    {
      table: {
        showing: "{total} میں سے {from}-{to} دکھائے جا رہے ہیں",
        rows: "قطاریں",
        page: "صفحہ {current} از {pages}",
        previous: "پچھلا صفحہ",
        next: "اگلا صفحہ",
      },
      search: {
        label: "ایڈمن حصے میں تلاش",
        placeholder: "صارفین، صفحات اور ٹولز تلاش کریں",
        none: "کچھ نہیں ملا۔",
        group: { users: "صارفین", pages: "صفحات", tools: "ٹولز" },
      },
      profile: { role: "ایڈمنسٹریٹر", account: "میرے اکاؤنٹ کی ترتیبات" },
      toolsPage: {
        runs: "کل بار چلے",
        used: "استعمال شدہ ٹولز",
        slowest: "سب سے سست ٹول",
        worst: "سب سے کم کامیابی: {name}",
      },
      failures: {
        when: "کب",
        code: "غلطی کا کوڈ",
        who: "کون",
        size: "ان پٹ کا سائز",
        message: "پیغام",
        shown: "دکھائی گئی ناکامیاں",
        shownHint: "آپ کے فلٹر کے بعد",
        topTool: "سب سے زیادہ ناکام ٹول",
        topCode: "سب سے عام غلطی",
        times: "{count} بار",
      },
      reports: {
        kind: "قسم",
        target: "ہدف",
        reason: "وجہ",
        source: "رپورٹ کرنے والا",
        actions: "کارروائی",
      },
      settings: {
        flagsOn: "آن کیے گئے فیچر",
        hourlyLimit: "فی گھنٹہ کاموں کی حد",
        dailyLimit: "فی دن کاموں کی حد",
        perPerson: "فی شخص",
      },
      users: {
        detailTitle: "صارف کی تفصیلات",
        never: "کبھی نہیں",
        twoStepOn: "دو مرحلہ آن",
        twoStepOff: "دو مرحلہ آف",
        locked: "مقفل",
        admins: "ایڈمن",
        empty: "کوئی صارف نہیں ملا۔",
        clickHint: "مکمل تفصیلات کھولنے کے لیے قطار پر کلک کریں۔",
        tasksTotal: "کل کام",
        tasksMonth: "30 دن کے کام",
        account: "اکاؤنٹ",
        joinedLabel: "شمولیت",
        lastSignIn: "آخری سائن اِن",
        language: "زبان",
        providers: "سائن اِن کے طریقے",
        passwordOnly: "پاس ورڈ",
        aiProvider: "AI فراہم کنندہ",
        none: "کوئی نہیں",
        failedLogins: "ناکام سائن اِن",
        assets: "اس صارف کے پاس کیا ہے",
        apiKeys: "API کلیدیں",
        webhooks: "ویب ہکس",
        teams: "ٹیمیں",
        files: "محفوظ فائلیں",
        schedules: "شیڈولز",
        sessions: "کھلے سیشن",
        topTools: "سب سے زیادہ استعمال ہونے والے ٹولز",
        recent: "حالیہ کام",
        controls: "اکاؤنٹ کے کنٹرول",
        controlsSub: "تبدیلیاں فوراً لاگو ہوتی ہیں۔",
      },
    },
  ],
};

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = merge(target[key] ?? {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

for (const [locale, index] of [
  ["en", 0],
  ["ur", 1],
]) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(readFileSync(file, "utf8"));
  for (const [namespace, pair] of Object.entries(ADDITIONS)) {
    messages[namespace] = merge(messages[namespace] ?? {}, pair[index]);
  }
  writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
