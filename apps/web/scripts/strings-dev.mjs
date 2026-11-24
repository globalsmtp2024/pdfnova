import { readFileSync, writeFileSync } from "node:fs";

const ADDITIONS = {
  legalPage: [
    {
      englishOnly:
        "The full text of this document is currently available in English only. The English text is the version that applies.",
    },
    {
      englishOnly:
        "اس دستاویز کا مکمل متن فی الحال صرف انگریزی میں دستیاب ہے۔ انگریزی متن ہی لاگو ہونے والا ورژن ہے۔",
    },
  ],
  devPage: [
    {
      metaTitle: "Developers",
      built: "Built for real integrations",
      keys: {
        title: "Free API keys",
        body: "Create as many as 20 keys from your dashboard and revoke them any time.",
      },
      uploads: {
        title: "Resumable uploads",
        body: "Send large files in chunks and resume from the server’s offset after a failure.",
      },
      progress: {
        title: "Live progress",
        body: "Follow every task over Server-Sent Events, or poll the task endpoint.",
      },
      limits: {
        title: "Fair-use limits",
        body: "Clear 429 responses with Retry-After and an exact reset time.",
      },
      openapi: {
        title: "OpenAPI",
        body: "A complete interactive reference at /docs and the raw spec at /openapi.json.",
      },
      webhooks: {
        title: "Webhooks",
        body: "Signed HTTPS callbacks with retries and a delivery log when tasks or signature requests finish.",
      },
      status: { title: "Status", body: "Live health of the API, database and storage." },
      samples: "Merge two PDFs in three languages",
    },
    {
      metaTitle: "ڈیولپرز",
      built: "حقیقی انٹیگریشنز کے لیے بنایا گیا",
      keys: {
        title: "مفت API کلیدیں",
        body: "اپنے ڈیش بورڈ سے 20 تک کلیدیں بنائیں اور کسی بھی وقت منسوخ کریں۔",
      },
      uploads: {
        title: "دوبارہ شروع ہونے والی اپ لوڈز",
        body: "بڑی فائلیں ٹکڑوں میں بھیجیں اور ناکامی کے بعد سرور کے آفسیٹ سے دوبارہ شروع کریں۔",
      },
      progress: {
        title: "براہ راست پیش رفت",
        body: "ہر کام کو Server-Sent Events پر دیکھیں، یا ٹاسک اینڈ پوائنٹ پول کریں۔",
      },
      limits: {
        title: "منصفانہ استعمال کی حدیں",
        body: "Retry-After اور درست ری سیٹ وقت کے ساتھ واضح 429 جوابات۔",
      },
      openapi: {
        title: "OpenAPI",
        body: "/docs پر مکمل انٹرایکٹو حوالہ اور /openapi.json پر خام تفصیل۔",
      },
      webhooks: {
        title: "ویب ہکس",
        body: "کام یا دستخط کی درخواستیں مکمل ہونے پر دستخط شدہ HTTPS کال بیکس، دوبارہ کوششوں اور ڈیلیوری لاگ کے ساتھ۔",
      },
      status: { title: "اسٹیٹس", body: "API، ڈیٹا بیس اور اسٹوریج کی براہ راست صحت۔" },
      samples: "تین زبانوں میں دو PDF ضم کریں",
    },
  ],
  apiPage: [
    {
      metaTitle: "API reference",
      metaDescription:
        "Endpoints, authentication, examples, rate limits and error codes for the REST API.",
      subtitle:
        "Base URL {url}/api/v1. Every tool on the site is available here, free, with fair-use limits.",
      englishOnly: "",
      sections: {
        authentication: "Authentication",
        quickstart: "Quickstart",
        rateLimits: "Rate limits",
        scopes: "Key scopes",
        webhooks: "Webhooks",
        sdks: "SDKs and CLI",
        errors: "Errors",
        changelog: "API changelog",
      },
      authBody:
        "Send an API key as a Bearer token. Create keys in your dashboard. Requests made with an API key don’t need CSRF tokens. Without a key, requests are treated as a guest session tied to a cookie.",
      quickBody:
        "Create a task, add files, start it and read the download link. Download links are signed and expire after 15 minutes.",
      quickDocs: "The full interactive OpenAPI reference is at",
      quickSpec: "and the specification at",
      rateBody:
        "Every caller shares the same public fair-use policy, available at <code>/api/v1/fair-use</code>. Your current usage and reset times are at <code>/api/v1/usage</code>. When a limit is reached the API responds with status 429, a Retry-After header and <code>details.reset_at</code>.",
      scopesBody:
        "Choose what a key may do when you create it. A key without a needed scope receives a 403 response. Keys can never change your account settings or create other keys. Write scopes include the matching read scope.",
      webhooksBody:
        "Add an https endpoint in your dashboard and pick events: task.succeeded, task.failed, esign.completed and esign.declined. Each delivery is a JSON POST signed with your endpoint secret in the X-PDFNova-Signature header (t=timestamp,v1=hex HMAC-SHA256 of “timestamp.body”). Failed deliveries are retried after 30 seconds, 2 minutes, 10 minutes, 1 hour and 6 hours, and every attempt appears in the delivery log.",
      sdksBody:
        "Small official clients wrap upload, start, wait and download. The Python package also installs the pdfnova command. The full interactive reference is at /docs and the raw OpenAPI document at /openapi.json.",
      errorsBody:
        "Every error uses the same envelope with a stable code, a human message and, where useful, a hint on how to fix it.",
      code: "Code",
      status: "Status",
      meaning: "Meaning",
      authRequired: "Auth required",
    },
    {
      metaTitle: "API حوالہ",
      metaDescription: "REST API کے اینڈ پوائنٹس، توثیق، مثالیں، ریٹ لمٹس اور غلطی کے کوڈز۔",
      subtitle:
        "بنیادی URL {url}/api/v1۔ سائٹ کا ہر ٹول یہاں دستیاب ہے، مفت، منصفانہ استعمال کی حدوں کے ساتھ۔",
      englishOnly:
        "اینڈ پوائنٹس کی تفصیل، کوڈ کی مثالیں اور تبدیلیوں کی فہرست تکنیکی حوالے کے طور پر انگریزی میں ہیں۔",
      sections: {
        authentication: "توثیق",
        quickstart: "فوری آغاز",
        rateLimits: "ریٹ لمٹس",
        scopes: "کلید کے دائرے",
        webhooks: "ویب ہکس",
        sdks: "SDKs اور CLI",
        errors: "غلطیاں",
        changelog: "API چینج لاگ",
      },
      authBody:
        "API کلید کو Bearer ٹوکن کے طور پر بھیجیں۔ کلیدیں اپنے ڈیش بورڈ میں بنائیں۔ API کلید کے ساتھ کی گئی درخواستوں کو CSRF ٹوکن کی ضرورت نہیں۔ کلید کے بغیر درخواستیں کوکی سے بندھے مہمان سیشن کے طور پر لی جاتی ہیں۔",
      quickBody:
        "ایک کام بنائیں، فائلیں شامل کریں، اسے شروع کریں اور ڈاؤن لوڈ لنک پڑھیں۔ ڈاؤن لوڈ لنک دستخط شدہ ہوتے ہیں اور 15 منٹ بعد ختم ہو جاتے ہیں۔",
      quickDocs: "مکمل انٹرایکٹو OpenAPI حوالہ یہاں ہے:",
      quickSpec: "اور تفصیل یہاں:",
      rateBody:
        "ہر کال کرنے والا ایک ہی عوامی منصفانہ استعمال کی پالیسی کا پابند ہے، جو <code>/api/v1/fair-use</code> پر دستیاب ہے۔ آپ کا موجودہ استعمال اور ری سیٹ کے اوقات <code>/api/v1/usage</code> پر ہیں۔ حد پر پہنچنے پر API اسٹیٹس 429، Retry-After ہیڈر اور <code>details.reset_at</code> کے ساتھ جواب دیتا ہے۔",
      scopesBody:
        "کلید بناتے وقت چنیں کہ وہ کیا کر سکتی ہے۔ مطلوبہ دائرے کے بغیر کلید کو 403 جواب ملتا ہے۔ کلیدیں آپ کے اکاؤنٹ کی ترتیبات نہیں بدل سکتیں اور نہ دوسری کلیدیں بنا سکتی ہیں۔ تحریری دائرے متعلقہ پڑھنے کے دائرے کو بھی شامل کرتے ہیں۔",
      webhooksBody:
        "اپنے ڈیش بورڈ میں https اینڈ پوائنٹ شامل کریں اور واقعات چنیں: task.succeeded، task.failed، esign.completed اور esign.declined۔ ہر ڈیلیوری ایک JSON POST ہے جس پر آپ کے اینڈ پوائنٹ کے خفیہ راز سے X-PDFNova-Signature ہیڈر میں دستخط ہوتے ہیں (t=ٹائم اسٹیمپ، v1=“ٹائم اسٹیمپ.باڈی” کا ہیکس HMAC-SHA256)۔ ناکام ڈیلیوری 30 سیکنڈ، 2 منٹ، 10 منٹ، 1 گھنٹے اور 6 گھنٹے بعد دوبارہ آزمائی جاتی ہے، اور ہر کوشش ڈیلیوری لاگ میں نظر آتی ہے۔",
      sdksBody:
        "چھوٹے سرکاری کلائنٹس اپ لوڈ، شروع، انتظار اور ڈاؤن لوڈ کو سمیٹتے ہیں۔ Python پیکیج pdfnova کمانڈ بھی انسٹال کرتا ہے۔ مکمل انٹرایکٹو حوالہ /docs پر اور خام OpenAPI دستاویز /openapi.json پر ہے۔",
      errorsBody:
        "ہر غلطی ایک ہی لفافے میں آتی ہے جس میں مستقل کوڈ، انسانی پیغام اور جہاں مفید ہو ٹھیک کرنے کا اشارہ ہوتا ہے۔",
      code: "کوڈ",
      status: "اسٹیٹس",
      meaning: "مطلب",
      authRequired: "توثیق ضروری",
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
