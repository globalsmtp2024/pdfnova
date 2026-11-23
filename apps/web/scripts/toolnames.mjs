import { readFileSync, writeFileSync } from "node:fs";

const NAMES = {
  "interleave-pages": [["Interleave odd and even scans", "Combine front-side and back-side scans into one document."], ["طاق اور جفت اسکین ملائیں", "اگلے اور پچھلے صفحات کے اسکین کو ایک دستاویز میں ملائیں۔"]],
  "remove-duplicate-pages": [["Remove duplicate pages", "Delete repeated pages and keep the first copy."], ["ڈپلیکیٹ صفحات ہٹائیں", "دہرائے گئے صفحات ہٹائیں اور پہلی کاپی رکھیں۔"]],
  "remove-images": [["Remove images", "Strip pictures and keep the text."], ["تصاویر ہٹائیں", "تصاویر ہٹائیں اور متن رکھیں۔"]],
  "remove-hidden-data": [["Remove JavaScript and hidden data", "Remove scripts, attachments and metadata before sharing."], ["جاوا اسکرپٹ اور چھپا ڈیٹا ہٹائیں", "شیئر کرنے سے پہلے اسکرپٹس، منسلکات اور میٹا ڈیٹا ہٹائیں۔"]],
  "pdf-to-powerpoint": [["PDF to PowerPoint", "Turn each PDF page into a slide."], ["PDF سے پاورپوائنٹ", "ہر PDF صفحے کو سلائیڈ میں بدلیں۔"]],
  "pdf-to-html": [["PDF to HTML", "Convert a PDF into a clean HTML page."], ["PDF سے HTML", "PDF کو صاف HTML صفحے میں بدلیں۔"]],
  "pdf-to-csv": [["PDF to CSV", "Extract each PDF table as a CSV file."], ["PDF سے CSV", "PDF کے ہر جدول کو CSV میں نکالیں۔"]],
  "pdf-to-pdfa": [["PDF to PDF/A", "Archive-ready PDF/A-1b, 2b and 3b."], ["PDF سے PDF/A", "آرکائیو کے لیے تیار PDF/A-1b، 2b اور 3b۔"]],
  "scan-to-pdf": [["Scan to PDF", "Turn photos of pages into a clean, straightened scan PDF."], ["اسکین سے PDF", "صفحات کی تصاویر کو صاف اور سیدھے اسکین PDF میں بدلیں۔"]],
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
