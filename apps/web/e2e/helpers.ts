import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Page } from "@playwright/test";

const API_PYTHON =
  process.env.E2E_API_PYTHON ??
  resolve(
    process.platform === "win32" ? "../api/.venv/Scripts/python.exe" : "../api/.venv/bin/python",
  );

const ENCRYPT_SCRIPT = [
  "import sys, pikepdf",
  "with pikepdf.open(sys.argv[1]) as pdf:",
  "    pdf.save(sys.argv[2], encryption=pikepdf.Encryption(owner=sys.argv[3], user=sys.argv[3], R=6))",
].join("\n");

export function makeEncryptedPdf(label: string, pages: number, password: string): Buffer {
  const folder = mkdtempSync(join(tmpdir(), "e2e-pdf-"));
  try {
    const plain = join(folder, "plain.pdf");
    const locked = join(folder, "locked.pdf");
    writeFileSync(plain, makePdf(label, pages));
    execFileSync(API_PYTHON, ["-c", ENCRYPT_SCRIPT, plain, locked, password], { timeout: 30_000 });
    return readFileSync(locked);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function makePdf(label: string, pages: number): Buffer {
  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let next = 4;
  for (let index = 1; index <= pages; index += 1) {
    const pageId = next;
    const contentId = next + 1;
    next += 2;
    const stream = `BT /F1 24 Tf 72 720 Td (${label} page ${index}) Tj ET`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    pageIds.push(pageId);
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`;
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1)
    body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

export async function revealAll(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight * 0.7, 300);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}
