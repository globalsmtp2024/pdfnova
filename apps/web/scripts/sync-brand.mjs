import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.BRAND_FILE,
  resolve(here, "../../../packages/shared/brand.json"),
  resolve(here, "../brand.json"),
].filter(Boolean);

const source = candidates.find((path) => {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
});

if (!source) {
  console.error("brand.json not found; set BRAND_FILE");
  process.exit(1);
}

const worker = resolve(here, "../node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const workerTarget = resolve(here, "../public/pdf.worker.min.mjs");
try {
  mkdirSync(dirname(workerTarget), { recursive: true });
  copyFileSync(worker, workerTarget);
} catch {
  console.error("pdf.js worker not found; run npm install");
  process.exit(1);
}

const target = resolve(here, "../src/config/brand.generated.json");
mkdirSync(dirname(target), { recursive: true });
const brand = JSON.parse(readFileSync(source, "utf8"));
writeFileSync(target, `${JSON.stringify(brand, null, 2)}\n`);
