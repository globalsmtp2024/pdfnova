import { readFileSync, writeFileSync } from "node:fs";

const NAMES = {
  "remove-annotations": [["Remove annotations", "Strip comments, highlights and stamps."], ["تبصرے ہٹائیں", "تبصرے، ہائی لائٹس اور اسٹیمپ ہٹا دیں۔"]],
  "remove-blank-pages": [["Remove blank pages", "Detect and delete empty pages automatically."], ["خالی صفحات ہٹائیں", "خالی صفحات خودکار طور پر ڈھونڈ کر حذف کریں۔"]],
  workflow: [["Workflow runner", "Chain several PDF tools into one run."], ["ورک فلو رنر", "کئی PDF ٹولز کو ایک ہی کام میں ترتیب سے چلائیں۔"]],
  "reverse-pages": [["Reverse pages", "Flip the page order of a PDF."], ["صفحات الٹ دیں", "PDF کے صفحات کی ترتیب الٹ دیں۔"]],
};

for (const [locale, index] of [["en", 0], ["ur", 1]]) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(readFileSync(file, "utf8"));
  messages.tools = messages.tools ?? {};
  for (const [slug, pair] of Object.entries(NAMES)) {
    messages.tools[slug] = { name: pair[index][0], description: pair[index][1] };
  }
  writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
