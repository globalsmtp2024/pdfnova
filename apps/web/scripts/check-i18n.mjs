import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REQUIRED = ["ur"];
const PHYSICAL = /\b(?:m[lr]|p[lr])-(?:\d|\[)|\btext-(?:left|right)\b|\brounded-(?:l|r|tl|tr|bl|br)(?:-|\b)|\bborder-(?:l|r)(?:-|\b)|\b(?:float|clear)-(?:left|right)\b/;
const ALLOWED_DIRECTIONAL_FILES = new Set([
  "src/components/ui/backgrounds.tsx",
  "src/components/ui/dialog.tsx",
  "src/components/layout/command-palette.tsx",
  "src/components/marketing/home-client.tsx",
  "src/components/tools/panels/crop.tsx",
  "src/components/illustrations.tsx",
]);

function leaves(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === "object" ? leaves(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const english = new Set(leaves(JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf8"))));
let failed = false;

for (const locale of REQUIRED) {
  const have = new Set(leaves(JSON.parse(readFileSync(join(ROOT, `messages/${locale}.json`), "utf8"))));
  const missing = [...english].filter((key) => !have.has(key));
  if (missing.length) {
    failed = true;
    console.error(`${locale}: ${missing.length} missing strings, for example ${missing.slice(0, 5).join(", ")}`);
  } else {
    console.log(`${locale}: complete (${english.size} strings)`);
  }
}

for (const file of readdirSync(join(ROOT, "messages"))) {
  const locale = file.replace(".json", "");
  if (locale === "en" || REQUIRED.includes(locale)) continue;
  const have = leaves(JSON.parse(readFileSync(join(ROOT, "messages", file), "utf8"))).length;
  console.log(`${locale}: scaffold with ${have} strings, falls back to English`);
}

const offenders = [];
for (const file of walk(join(ROOT, "src"))) {
  const name = relative(ROOT, file);
  if (ALLOWED_DIRECTIONAL_FILES.has(name)) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (PHYSICAL.test(line)) offenders.push(`${name}:${index + 1}: ${line.trim().slice(0, 90)}`);
    });
}
if (offenders.length) {
  failed = true;
  console.error(`Physical left/right classes found (use start/end for RTL):\n${offenders.join("\n")}`);
} else {
  console.log("rtl: no physical direction classes outside the allowed files");
}

process.exit(failed ? 1 : 0);
