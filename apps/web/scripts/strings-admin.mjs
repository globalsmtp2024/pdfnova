import { readFileSync, writeFileSync } from "node:fs";

const ADDITIONS = {
  adminPanel: [
    {
      welcome: "Welcome back, {name}",
      allToolsUsed: "Every tool ran at least once in this period.",
      charts: {
        legendTasks: "Tasks",
        legendFailed: "Failed",
        legendSignups: "New users",
        outcome: "Task outcomes",
        succeeded: "Succeeded",
        failed: "Failed",
        other: "Other",
      },
      cols: { share: "Share" },
      failures: { signedIn: "Signed in", guest: "Guest" },
      users: {
        found: "{count} users",
        user: "User",
        status: "Status",
        activity: "Activity",
        statusActive: "Active",
        statusDisabled: "Disabled",
        verified: "Email verified",
        unverified: "Email not verified",
        lastSeen: "Last sign-in {when}",
        neverSeen: "Never signed in",
        joined: "Joined {date}",
      },
      system: {
        allGood: "All systems are running normally",
        issues: "{count} checks need attention",
      },
      settings: {
        flagsTitle: "Feature flags",
        flagsSub: "Switch parts of the site on or off for everyone.",
        fairUseTitle: "Fair-use limits",
        announcementTitle: "Announcement bar",
        announcementSub: "A short message shown at the top of every page.",
        preview: "Preview",
      },
    },
    {
      welcome: "خوش آمدید، {name}",
      allToolsUsed: "اس مدت میں ہر ٹول کم از کم ایک بار چلا۔",
      charts: {
        legendTasks: "کام",
        legendFailed: "ناکام",
        legendSignups: "نئے صارفین",
        outcome: "کاموں کے نتائج",
        succeeded: "کامیاب",
        failed: "ناکام",
        other: "دیگر",
      },
      cols: { share: "حصہ" },
      failures: { signedIn: "سائن اِن", guest: "مہمان" },
      users: {
        found: "{count} صارفین",
        user: "صارف",
        status: "حالت",
        activity: "سرگرمی",
        statusActive: "فعال",
        statusDisabled: "غیر فعال",
        verified: "ای میل تصدیق شدہ",
        unverified: "ای میل تصدیق شدہ نہیں",
        lastSeen: "آخری سائن اِن {when}",
        neverSeen: "کبھی سائن اِن نہیں ہوئے",
        joined: "شمولیت {date}",
      },
      system: {
        allGood: "تمام سسٹم معمول کے مطابق چل رہے ہیں",
        issues: "{count} جانچوں پر توجہ درکار ہے",
      },
      settings: {
        flagsTitle: "فیچر فلیگز",
        flagsSub: "سائٹ کے حصے سب کے لیے آن یا آف کریں۔",
        fairUseTitle: "منصفانہ استعمال کی حدیں",
        announcementTitle: "اعلان کی پٹی",
        announcementSub: "ہر صفحے کے اوپر دکھایا جانے والا مختصر پیغام۔",
        preview: "پیش منظر",
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
