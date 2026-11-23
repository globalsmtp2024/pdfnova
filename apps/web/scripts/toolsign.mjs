import { readFileSync, writeFileSync } from "node:fs";

const SIGN = {
  en: {
    modeLabel: "Signature type",
    mode_text: "Type",
    mode_draw: "Draw",
    mode_upload: "Upload",
    typeLabel: "Your name",
    drawLabel: "Draw your signature here",
    clear: "Clear",
    tooLarge: "That image is larger than 3 MB.",
    needText: "Type your name to sign with.",
    needImage: "Draw or upload a signature first.",
    pagesLabel: "Pages to sign (for example last, 1, 1-3)",
    x: "Horizontal %",
    y: "Vertical %",
    width: "Width %",
    summary: "{count, plural, one {Signing # file} other {Signing # files}}",
  },
  ur: {
    modeLabel: "دستخط کی قسم",
    mode_text: "ٹائپ کریں",
    mode_draw: "ہاتھ سے بنائیں",
    mode_upload: "اپ لوڈ",
    typeLabel: "آپ کا نام",
    drawLabel: "اپنے دستخط یہاں بنائیں",
    clear: "صاف کریں",
    tooLarge: "یہ تصویر 3 MB سے بڑی ہے۔",
    needText: "دستخط کے لیے اپنا نام ٹائپ کریں۔",
    needImage: "پہلے دستخط بنائیں یا اپ لوڈ کریں۔",
    pagesLabel: "دستخط والے صفحات (مثلاً last، 1، 1-3)",
    x: "افقی %",
    y: "عمودی %",
    width: "چوڑائی %",
    summary: "{count, plural, other {# فائلوں پر دستخط}}",
  },
};

for (const locale of ["en", "ur"]) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(readFileSync(file, "utf8"));
  messages.tool_sign = SIGN[locale];
  writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
