import { readFileSync, writeFileSync } from "node:fs";

const NAMES = {
  "ai-smart-split": [
    ["Smart split", "AI finds where documents begin and end."],
    ["اسمارٹ اسپلٹ", "AI تلاش کرتا ہے کہ دستاویزیں کہاں شروع اور ختم ہوتی ہیں۔"],
  ],
  "ai-rename": [
    ["AI rename", "Name your PDF from its content."],
    ["AI ری نیم", "مواد کی بنیاد پر PDF کا نام رکھیں۔"],
  ],
  "ai-categorize": [
    ["Auto-categorize", "Label a PDF with a category and tags."],
    ["خودکار زمرہ بندی", "PDF کو زمرہ اور ٹیگز دیں۔"],
  ],
  "ai-key-dates": [
    ["Key dates extractor", "Find deadlines and export them as a calendar file."],
    ["اہم تاریخیں نکالیں", "آخری تاریخیں تلاش کر کے کیلنڈر فائل میں برآمد کریں۔"],
  ],
  "create-form": [
    ["Create fillable form", "Add form fields to any PDF."],
    ["فِل ایبل فارم بنائیں", "کسی بھی PDF میں فارم فیلڈز شامل کریں۔"],
  ],
  "detect-form-fields": [
    ["Auto-detect form fields", "Turn blanks and boxes into fillable fields."],
    ["فارم فیلڈز خودکار تلاش", "خالی جگہوں اور باکسز کو فِل ایبل فیلڈز میں بدلیں۔"],
  ],
  "digital-sign": [
    ["Digital signature", "Sign with your own certificate (.p12 or .pfx)."],
    ["ڈیجیٹل دستخط", "اپنے سرٹیفکیٹ (.p12 یا .pfx) سے دستخط کریں۔"],
  ],
  "verify-signatures": [
    ["Verify signatures", "Check the digital signatures in a PDF."],
    ["دستخط کی توثیق", "PDF کے ڈیجیٹل دستخط جانچیں۔"],
  ],
  "image-remove-background": [
    ["Remove background", "Cut out subjects cleanly."],
    ["پس منظر ہٹائیں", "موضوع کو صاف کاٹیں۔"],
  ],
  "image-watermark": [
    ["Watermark image", "Protect images with text or a logo."],
    ["تصویر پر واٹر مارک", "متن یا لوگو سے تصاویر کو محفوظ کریں۔"],
  ],
  "image-add-text": [
    ["Add text to image", "Add a caption or title to an image."],
    ["تصویر میں متن شامل کریں", "تصویر میں کیپشن یا عنوان شامل کریں۔"],
  ],
  "interleave-pages": [
    ["Interleave odd and even scans", "Combine front-side and back-side scans into one document."],
    ["طاق اور جفت اسکین ملائیں", "اگلے اور پچھلے صفحات کے اسکین کو ایک دستاویز میں ملائیں۔"],
  ],
  "remove-duplicate-pages": [
    ["Remove duplicate pages", "Delete repeated pages and keep the first copy."],
    ["ڈپلیکیٹ صفحات ہٹائیں", "دہرائے گئے صفحات ہٹائیں اور پہلی کاپی رکھیں۔"],
  ],
  "remove-images": [
    ["Remove images", "Strip pictures and keep the text."],
    ["تصاویر ہٹائیں", "تصاویر ہٹائیں اور متن رکھیں۔"],
  ],
  "remove-hidden-data": [
    [
      "Remove JavaScript and hidden data",
      "Remove scripts, attachments and metadata before sharing.",
    ],
    [
      "جاوا اسکرپٹ اور چھپا ڈیٹا ہٹائیں",
      "شیئر کرنے سے پہلے اسکرپٹس، منسلکات اور میٹا ڈیٹا ہٹائیں۔",
    ],
  ],
  "pdf-to-powerpoint": [
    ["PDF to PowerPoint", "Turn each PDF page into a slide."],
    ["PDF سے پاورپوائنٹ", "ہر PDF صفحے کو سلائیڈ میں بدلیں۔"],
  ],
  "pdf-to-html": [
    ["PDF to HTML", "Convert a PDF into a clean HTML page."],
    ["PDF سے HTML", "PDF کو صاف HTML صفحے میں بدلیں۔"],
  ],
  "pdf-to-csv": [
    ["PDF to CSV", "Extract each PDF table as a CSV file."],
    ["PDF سے CSV", "PDF کے ہر جدول کو CSV میں نکالیں۔"],
  ],
  "pdf-to-pdfa": [
    ["PDF to PDF/A", "Archive-ready PDF/A-1b, 2b and 3b."],
    ["PDF سے PDF/A", "آرکائیو کے لیے تیار PDF/A-1b، 2b اور 3b۔"],
  ],
  "scan-to-pdf": [
    ["Scan to PDF", "Turn photos of pages into a clean, straightened scan PDF."],
    ["اسکین سے PDF", "صفحات کی تصاویر کو صاف اور سیدھے اسکین PDF میں بدلیں۔"],
  ],
  "remove-annotations": [
    ["Remove annotations", "Strip comments, highlights and stamps."],
    ["تبصرے ہٹائیں", "تبصرے، ہائی لائٹس اور اسٹیمپ ہٹا دیں۔"],
  ],
  "remove-blank-pages": [
    ["Remove blank pages", "Detect and delete empty pages automatically."],
    ["خالی صفحات ہٹائیں", "خالی صفحات خودکار طور پر ڈھونڈ کر حذف کریں۔"],
  ],
  workflow: [
    ["Workflow runner", "Chain several PDF tools into one run."],
    ["ورک فلو رنر", "کئی PDF ٹولز کو ایک ہی کام میں ترتیب سے چلائیں۔"],
  ],
  "pdf-to-word-ocr": [
    ["PDF to Word (OCR)", "Read scanned pages with OCR, then convert to Word."],
    ["PDF سے Word (OCR)", "اسکین شدہ صفحات کو OCR سے پڑھیں، پھر Word میں تبدیل کریں۔"],
  ],
  "pdf-to-powerpoint-ocr": [
    ["PDF to PowerPoint (OCR)", "Read scanned pages with OCR, then convert to slides."],
    ["PDF سے PowerPoint (OCR)", "اسکین شدہ صفحات کو OCR سے پڑھیں، پھر سلائیڈز میں تبدیل کریں۔"],
  ],
  "pdf-to-excel-ocr": [
    ["PDF to Excel (OCR)", "Read scanned tables with OCR, then convert to Excel."],
    ["PDF سے Excel (OCR)", "اسکین شدہ جدولوں کو OCR سے پڑھیں، پھر Excel میں تبدیل کریں۔"],
  ],
  "reverse-pages": [
    ["Reverse pages", "Flip the page order of a PDF."],
    ["صفحات الٹ دیں", "PDF کے صفحات کی ترتیب الٹ دیں۔"],
  ],
};

for (const [locale, index] of [
  ["en", 0],
  ["ur", 1],
]) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(readFileSync(file, "utf8"));
  messages.tools = messages.tools ?? {};
  for (const [slug, pair] of Object.entries(NAMES)) {
    messages.tools[slug] = { name: pair[index][0], description: pair[index][1] };
  }
  writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
