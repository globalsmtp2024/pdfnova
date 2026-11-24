import { readFileSync, writeFileSync } from "node:fs";

const ADDITIONS = {
  schemaFields: [
    {
      pages_placeholder: "1-3, 5, 8-last",
      language_placeholder: "For example English or Urdu",
      focus_placeholder: "For example key risks and deadlines",
      extra_placeholder: "Anything else the answer should consider",
      hint_placeholder: "A short hint about what to look for",
      title_placeholder: "Document title",
      author_placeholder: "Author name",
      find_placeholder: "Text to find",
      replace_placeholder: "Replacement text",
      questions_placeholder: "One question per line",
      fields_placeholder: "One field name per line",
      categories_placeholder: "One category per line",
      choices_placeholder: "One choice per line",
      text_placeholder: "Type your text",
      value_placeholder: "Value",
    },
    {
      pages_placeholder: "1-3, 5, 8-last",
      language_placeholder: "مثلاً انگریزی یا اردو",
      focus_placeholder: "مثلاً اہم خطرات اور آخری تاریخیں",
      extra_placeholder: "کوئی اور بات جو جواب میں مدنظر رکھی جائے",
      hint_placeholder: "کیا تلاش کرنا ہے اس کا مختصر اشارہ",
      title_placeholder: "دستاویز کا عنوان",
      author_placeholder: "مصنف کا نام",
      find_placeholder: "تلاش کرنے کا متن",
      replace_placeholder: "بدلنے کا متن",
      questions_placeholder: "ہر سطر میں ایک سوال",
      fields_placeholder: "ہر سطر میں ایک فیلڈ کا نام",
      categories_placeholder: "ہر سطر میں ایک زمرہ",
      choices_placeholder: "ہر سطر میں ایک انتخاب",
      text_placeholder: "اپنا متن لکھیں",
      value_placeholder: "قدر",
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
