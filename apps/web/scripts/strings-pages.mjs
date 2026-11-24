import { readFileSync, writeFileSync } from "node:fs";

const ADDITIONS = {
  common: [{ breadcrumb: "Breadcrumb" }, { breadcrumb: "نیویگیشن راستہ" }],
  sitePages: [
    {
      security: {
        metaTitle: "Security and privacy",
        title: "Security and privacy, explained plainly",
        subtitle:
          "These are the protections that are built and running today. We don’t claim certifications we don’t have.",
        timelineTitle: "The auto-deletion timeline",
        timelineSubtitle: "Every file follows the same short lifecycle.",
        reportTitle: "Found a vulnerability?",
        reportBefore: "Please report it privately through the",
        reportLink: "contact form",
        reportAfter: "with the topic Security report. We appreciate responsible disclosure.",
      },
      about: {
        metaTitle: "About",
        title: "Why {brand} exists",
        subtitle:
          "Documents shouldn’t be a chore, and fixing them shouldn’t cost money. That’s the whole idea.",
        missionTitle: "Our mission",
        missionOne:
          "Everyone handles documents: students submitting coursework, freelancers sending contracts, small businesses filing receipts, schools sharing course packs. Too often the tools are expensive, cluttered or careless with private files.",
        missionTwo:
          "{brand} puts every document tool in one fast, calm place, free for everyone, with privacy treated as a default rather than an upsell.",
        principlesTitle: "Principles we build by",
        freeTitle: "How it stays free",
        freeOne:
          "Processing is efficient by design: files are handled by small, isolated workers and deleted quickly, so storage costs stay low.",
        freeTwo:
          "Fair-use limits stop abuse without getting in the way of normal use. They are public, generous and the same for everyone.",
        freeThree: "Optional contributions help cover servers and development.",
        support: "Support the project",
      },
      accessibility: {
        metaTitle: "Accessibility statement",
        title: "Accessibility statement",
        subtitle:
          "We aim to meet WCAG 2.2 level AA across the whole site. Here is what we do and how to tell us when we fall short.",
        limitsTitle: "Known limitations",
        limitsBody:
          "We have not yet had every tool tested by keyboard-only and screen reader users, and some pointer-based tools such as the page editor are harder to use without a mouse. If you hit a barrier, please tell us.",
        helpBefore:
          "If something on {brand} is hard to use with your assistive technology, please tell us through the",
        contactLink: "contact form",
        helpMiddle:
          ". We aim to respond within two working days. You can also see every keyboard shortcut on the",
        shortcutsLink: "shortcuts page",
      },
      compare: {
        metaTitle: "Overview",
        title: "{brand} at a glance",
        subtitle:
          "An honest overview of what you get. No comparisons with other products, just facts you can check.",
        feature: "Feature",
        caption: "{brand} feature overview",
        note: "The catalog lists {count} tools. Each one is marked Coming soon until it actually works, and the changelog shows what shipped when.",
      },
      help: {
        metaTitle: "Help center",
        metaDescription:
          "Answers to common questions about tools, files, privacy, fair use and the API.",
        title: "How can we help?",
        subtitle: "Search the answers below, or send us a message.",
        stuck: "Still stuck?",
        searchPlaceholder: "Search help articles",
        noMatch: "No answers match “{query}”.",
        noMatchBody: "Try different words, or contact us and a person will help.",
      },
      howItWorks: {
        metaTitle: "How it works",
        subtitle:
          "From the moment you drop a file to the moment it disappears, here is exactly what happens.",
      },
      blog: {
        metaTitle: "Blog",
        subtitle: "Practical, honest guides to getting documents done.",
        all: "All",
        englishOnly: "Articles are currently written in English only.",
      },
      solutions: {
        metaTitle: "Solutions",
        title: "Solutions for every kind of work",
        subtitle: "Ready-made ways to use every tool, tuned for how different people work.",
        pains: "Sound familiar?",
        tools: "The tools that help",
        workflow: "A sample workflow",
      },
      features: {
        metaTitle: "Features",
        title: "Everything the platform can do",
        subtitle:
          "A free, private document platform built for speed, batches and automation, with an API for everything.",
      },
    },
    {
      security: {
        metaTitle: "سیکیورٹی اور رازداری",
        title: "سیکیورٹی اور رازداری، سادہ الفاظ میں",
        subtitle:
          "یہ وہ تحفظات ہیں جو آج بنے ہوئے اور چل رہے ہیں۔ ہم ان سرٹیفکیشنز کا دعویٰ نہیں کرتے جو ہمارے پاس نہیں۔",
        timelineTitle: "خودکار حذف کی ٹائم لائن",
        timelineSubtitle: "ہر فائل ایک ہی مختصر دورانیے سے گزرتی ہے۔",
        reportTitle: "کوئی کمزوری ملی؟",
        reportBefore: "براہ کرم اسے نجی طور پر",
        reportLink: "رابطہ فارم",
        reportAfter:
          "کے ذریعے سیکیورٹی رپورٹ کے موضوع کے ساتھ بھیجیں۔ ہم ذمہ دارانہ اطلاع کی قدر کرتے ہیں۔",
      },
      about: {
        metaTitle: "ہمارے بارے میں",
        title: "{brand} کیوں موجود ہے",
        subtitle:
          "دستاویزات بوجھ نہیں ہونی چاہئیں اور انہیں ٹھیک کرنے پر پیسے نہیں لگنے چاہئیں۔ بس یہی ہمارا خیال ہے۔",
        missionTitle: "ہمارا مشن",
        missionOne:
          "ہر کوئی دستاویزات سنبھالتا ہے: کورس ورک جمع کراتے طلبہ، معاہدے بھیجتے فری لانسرز، رسیدیں فائل کرتے چھوٹے کاروبار، کورس پیک بانٹتے اسکول۔ اکثر ٹولز مہنگے، بھرے ہوئے یا نجی فائلوں کے معاملے میں لاپروا ہوتے ہیں۔",
        missionTwo:
          "{brand} ہر دستاویزی ٹول کو ایک تیز اور پرسکون جگہ پر رکھتا ہے، سب کے لیے مفت، اور رازداری کو اضافی فروخت کے بجائے ڈیفالٹ سمجھتا ہے۔",
        principlesTitle: "وہ اصول جن پر ہم بناتے ہیں",
        freeTitle: "یہ مفت کیسے رہتا ہے",
        freeOne:
          "پروسیسنگ ڈیزائن کے لحاظ سے کارآمد ہے: فائلیں چھوٹے، الگ تھلگ ورکرز سنبھالتے ہیں اور جلد حذف ہو جاتی ہیں، اس لیے ذخیرے کا خرچ کم رہتا ہے۔",
        freeTwo:
          "منصفانہ استعمال کی حدیں عام استعمال میں رکاوٹ بنے بغیر غلط استعمال روکتی ہیں۔ وہ عوامی، فراخ اور سب کے لیے یکساں ہیں۔",
        freeThree: "اختیاری عطیات سرورز اور ڈیولپمنٹ کے اخراجات پورے کرنے میں مدد دیتے ہیں۔",
        support: "پروجیکٹ کی مدد کریں",
      },
      accessibility: {
        metaTitle: "رسائی کا بیان",
        title: "رسائی کا بیان",
        subtitle:
          "ہمارا ہدف پوری سائٹ پر WCAG 2.2 درجہ AA پر پورا اترنا ہے۔ ہم کیا کرتے ہیں اور کمی رہ جانے پر ہمیں کیسے بتائیں، یہ یہاں ہے۔",
        limitsTitle: "معلوم حدود",
        limitsBody:
          "ہم نے ابھی ہر ٹول کو صرف کی بورڈ اور اسکرین ریڈر استعمال کرنے والوں سے نہیں جانچا، اور ماؤس پر مبنی کچھ ٹولز جیسے صفحہ ایڈیٹر ماؤس کے بغیر مشکل ہیں۔ رکاوٹ ملے تو براہ کرم ہمیں بتائیں۔",
        helpBefore:
          "اگر {brand} پر کوئی چیز آپ کی معاون ٹیکنالوجی کے ساتھ استعمال کرنا مشکل ہو تو براہ کرم ہمیں",
        contactLink: "رابطہ فارم",
        helpMiddle:
          "کے ذریعے بتائیں۔ ہم دو کاروباری دنوں میں جواب دینے کی کوشش کرتے ہیں۔ آپ ہر کی بورڈ شارٹ کٹ",
        shortcutsLink: "شارٹ کٹس کے صفحے",
      },
      compare: {
        metaTitle: "جائزہ",
        title: "{brand} ایک نظر میں",
        subtitle:
          "آپ کو کیا ملتا ہے اس کا ایماندار جائزہ۔ دوسری مصنوعات سے کوئی موازنہ نہیں، صرف وہ حقائق جو آپ خود جانچ سکتے ہیں۔",
        feature: "خصوصیت",
        caption: "{brand} کی خصوصیات کا جائزہ",
        note: "کیٹلاگ میں {count} ٹولز درج ہیں۔ ہر ٹول جب تک واقعی کام نہ کرے جلد آ رہا ہے کے نشان کے ساتھ رہتا ہے، اور چینج لاگ بتاتا ہے کہ کب کیا جاری ہوا۔",
      },
      help: {
        metaTitle: "مدد کا مرکز",
        metaDescription:
          "ٹولز، فائلوں، رازداری، منصفانہ استعمال اور API کے بارے میں عام سوالات کے جوابات۔",
        title: "ہم کیسے مدد کر سکتے ہیں؟",
        subtitle: "نیچے جوابات تلاش کریں، یا ہمیں پیغام بھیجیں۔",
        stuck: "پھر بھی مسئلہ ہے؟",
        searchPlaceholder: "مدد کے مضامین تلاش کریں",
        noMatch: "“{query}” سے کوئی جواب نہیں ملا۔",
        noMatchBody: "دوسرے الفاظ آزمائیں، یا ہم سے رابطہ کریں اور کوئی انسان آپ کی مدد کرے گا۔",
      },
      howItWorks: {
        metaTitle: "یہ کیسے کام کرتا ہے",
        subtitle: "فائل ڈالنے کے لمحے سے لے کر اس کے غائب ہونے تک، بالکل یہی ہوتا ہے۔",
      },
      blog: {
        metaTitle: "بلاگ",
        subtitle: "دستاویزات کا کام نمٹانے کے لیے عملی اور ایماندار رہنما۔",
        all: "سب",
        englishOnly: "مضامین فی الحال صرف انگریزی میں لکھے گئے ہیں۔",
      },
      solutions: {
        metaTitle: "حل",
        title: "ہر قسم کے کام کے لیے حل",
        subtitle: "ہر ٹول کو استعمال کرنے کے تیار طریقے، مختلف لوگوں کے کام کے انداز کے مطابق۔",
        pains: "کیا یہ جانا پہچانا لگتا ہے؟",
        tools: "مددگار ٹولز",
        workflow: "نمونہ ورک فلو",
      },
      features: {
        metaTitle: "خصوصیات",
        title: "پلیٹ فارم جو کچھ کر سکتا ہے",
        subtitle:
          "رفتار، بیچ اور آٹومیشن کے لیے بنایا گیا مفت، نجی دستاویزی پلیٹ فارم، ہر چیز کے لیے API کے ساتھ۔",
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
