import { readFileSync, writeFileSync } from "node:fs";

const FIELDS = {
  summary: ["{count, plural, one {Ready to process # file} other {Ready to process # files}}", "{count, plural, other {# فائلیں پروسیس کے لیے تیار}}"],
  requiredField: ["{field} is required.", "{field} درکار ہے۔"],
  imageTooLarge: ["That image is larger than 3 MB.", "یہ تصویر 3 MB سے بڑی ہے۔"],
  page_size: ["Page size", "صفحے کا سائز"],
  page_size_fit: ["Fit to image", "تصویر کے مطابق"],
  page_size_a4: ["A4", "A4"],
  page_size_letter: ["Letter", "لیٹر"],
  orientation: ["Orientation", "رخ"],
  orientation_auto: ["Automatic", "خودکار"],
  orientation_portrait: ["Portrait", "عمودی"],
  orientation_landscape: ["Landscape", "افقی"],
  margin_mm: ["Margin (mm)", "حاشیہ (ملی میٹر)"],
  merge: ["Combine into one PDF", "سب کو ایک PDF میں ملائیں"],
  quality: ["Quality (40-100)", "معیار (40-100)"],
  format: ["Format", "فارمیٹ"],
  format_png: ["PNG", "PNG"],
  format_jpg: ["JPG", "JPG"],
  format_webp: ["WebP", "WebP"],
  dpi: ["Resolution (DPI)", "ریزولوشن (DPI)"],
  pages: ["Pages (e.g. 1-3, 5, last)", "صفحات (مثلاً 1-3، 5، last)"],
};

for (const [locale, index] of [["en", 0], ["ur", 1]]) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(readFileSync(file, "utf8"));
  messages.schemaFields = messages.schemaFields ?? {};
  for (const [key, pair] of Object.entries(FIELDS)) messages.schemaFields[key] = pair[index];
  writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
