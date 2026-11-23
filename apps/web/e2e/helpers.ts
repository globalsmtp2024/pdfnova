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

const IMAGE_PDF_SCRIPT = [
  "import sys, zlib, pikepdf",
  "from PIL import Image",
  "label, pages = sys.argv[2], int(sys.argv[3])",
  "with pikepdf.new() as pdf:",
  "    font = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica))",
  "    for number in range(pages):",
  "        bands = [Image.blend(Image.effect_noise((1400, 1050), 45 + band * 9 + number), Image.linear_gradient('L').resize((1400, 1050)), 0.5) for band in range(3)]",
  "        picture = Image.merge('RGB', bands)",
  "        image = pikepdf.Stream(pdf, zlib.compress(picture.tobytes(), 9))",
  "        image.Type, image.Subtype, image.Filter = pikepdf.Name.XObject, pikepdf.Name.Image, pikepdf.Name.FlateDecode",
  "        image.Width, image.Height, image.BitsPerComponent, image.ColorSpace = 1400, 1050, 8, pikepdf.Name.DeviceRGB",
  "        pdf.add_blank_page(page_size=(612, 792))",
  "        page = pdf.pages[-1]",
  "        page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im0=pdf.make_indirect(image)), Font=pikepdf.Dictionary(F1=font))",
  "        text = f'BT /F1 24 Tf 72 720 Td ({label} page {number + 1}) Tj ET'",
  "        page.Contents = pdf.make_stream(('q 468 0 0 351 72 300 cm /Im0 Do Q ' + text).encode())",
  "    pdf.save(sys.argv[1])",
].join("\n");

export function makeImagePdf(label: string, pages: number): Buffer {
  const folder = mkdtempSync(join(tmpdir(), "e2e-pdf-"));
  try {
    const target = join(folder, "photos.pdf");
    execFileSync(API_PYTHON, ["-c", IMAGE_PDF_SCRIPT, target, label, String(pages)], {
      timeout: 60_000,
    });
    return readFileSync(target);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const INSPECT_PROTECTED_SCRIPT = [
  "import json, sys, pikepdf",
  "report = {}",
  "try:",
  "    pikepdf.open(sys.argv[1]).close()",
  "    report['opens_without_password'] = True",
  "except pikepdf.PasswordError:",
  "    report['opens_without_password'] = False",
  "with pikepdf.open(sys.argv[1], password=sys.stdin.read()) as pdf:",
  "    report['encrypted'] = pdf.is_encrypted",
  "    report['revision'] = pdf.encryption.R",
  "    report['pages'] = len(pdf.pages)",
  "    report['allow'] = {name: bool(getattr(pdf.allow, name)) for name in",
  "        ('extract', 'print_lowres', 'print_highres', 'modify_other', 'modify_annotation',",
  "         'modify_form', 'modify_assembly', 'accessibility')}",
  "print(json.dumps(report))",
].join("\n");

export type ProtectedPdfReport = {
  opens_without_password: boolean;
  encrypted: boolean;
  revision: number;
  pages: number;
  allow: Record<string, boolean>;
};

export function inspectProtectedPdf(pdf: Buffer, password: string): ProtectedPdfReport {
  const folder = mkdtempSync(join(tmpdir(), "e2e-pdf-"));
  try {
    const target = join(folder, "protected.pdf");
    writeFileSync(target, pdf);
    const output = execFileSync(API_PYTHON, ["-c", INSPECT_PROTECTED_SCRIPT, target], {
      input: password,
      timeout: 30_000,
    });
    return JSON.parse(output.toString("utf8")) as ProtectedPdfReport;
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

const PAGE_BOXES_SCRIPT = [
  "import json, sys, pikepdf",
  "with pikepdf.open(sys.argv[1]) as pdf:",
  "    print(json.dumps([{key: [float(v) for v in page.obj[key]] if key in page.obj else None for key in ('/MediaBox', '/CropBox')} for page in pdf.pages]))",
].join("\n");

export type PageBoxes = { "/MediaBox": number[] | null; "/CropBox": number[] | null };

export function readPageBoxes(pdf: Buffer): PageBoxes[] {
  const folder = mkdtempSync(join(tmpdir(), "e2e-pdf-"));
  try {
    const source = join(folder, "input.pdf");
    writeFileSync(source, pdf);
    const output = execFileSync(API_PYTHON, ["-c", PAGE_BOXES_SCRIPT, source], {
      timeout: 30_000,
      encoding: "utf8",
    });
    return JSON.parse(output) as PageBoxes[];
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const RESTRICT_SCRIPT = [
  "import sys, pikepdf",
  "allow = pikepdf.Permissions(extract=False, modify_other=False, print_lowres=False, print_highres=False)",
  "with pikepdf.open(sys.argv[1]) as pdf:",
  "    pdf.save(sys.argv[2], encryption=pikepdf.Encryption(owner=sys.argv[3], user='', R=6, allow=allow))",
].join("\n");

const DESCRIBE_SCRIPT = [
  "import json, sys, pikepdf",
  "with pikepdf.open(sys.argv[1]) as pdf:",
  "    print(json.dumps({'encrypted': pdf.is_encrypted, 'pages': len(pdf.pages), 'extract': pdf.allow.extract, 'modify': pdf.allow.modify_other}))",
].join("\n");

export function makeOwnerRestrictedPdf(
  label: string,
  pages: number,
  ownerPassword: string,
): Buffer {
  const folder = mkdtempSync(join(tmpdir(), "e2e-pdf-"));
  try {
    const plain = join(folder, "plain.pdf");
    const restricted = join(folder, "restricted.pdf");
    writeFileSync(plain, makePdf(label, pages));
    execFileSync(API_PYTHON, ["-c", RESTRICT_SCRIPT, plain, restricted, ownerPassword], {
      timeout: 30_000,
    });
    return readFileSync(restricted);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function runPython(script: string, args: string[]): Buffer {
  return execFileSync(API_PYTHON, ["-c", script, ...args], { timeout: 30_000 });
}

const FORM_SCRIPT = [
  "import sys",
  "from reportlab.lib.pagesizes import A4",
  "from reportlab.pdfgen import canvas",
  "pdf = canvas.Canvas(sys.argv[1], pagesize=A4)",
  "pdf.drawString(72, 780, 'Application form')",
  "pdf.acroForm.textfield(name='full_name', x=72, y=700, width=300, height=24, value=sys.argv[2])",
  "pdf.acroForm.checkbox(name='agree', x=72, y=650, size=18, checked=True)",
  "pdf.showPage()",
  "pdf.save()",
].join("\n");

export function makeFormPdf(value: string): Buffer {
  const folder = mkdtempSync(join(tmpdir(), "e2e-pdf-"));
  try {
    const target = join(folder, "form.pdf");
    runPython(FORM_SCRIPT, [target, value]);
    return readFileSync(target);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export type PdfProtection = {
  encrypted: boolean;
  pages: number;
  extract: boolean;
  modify: boolean;
};

export function describePdfProtection(data: Buffer): PdfProtection {
  const folder = mkdtempSync(join(tmpdir(), "e2e-pdf-"));
  try {
    const target = join(folder, "output.pdf");
    writeFileSync(target, data);
    const output = execFileSync(API_PYTHON, ["-c", DESCRIBE_SCRIPT, target], { timeout: 30_000 });
    return JSON.parse(output.toString("utf8")) as PdfProtection;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const FACTS_SCRIPT = [
  "import sys, json, pikepdf",
  "from pypdf import PdfReader",
  "with pikepdf.open(sys.argv[1]) as pdf:",
  "    form = pdf.Root.get('/AcroForm')",
  "    info = pdf.trailer.get('/Info')",
  "    xmp = {}",
  "    if '/Metadata' in pdf.Root:",
  "        meta = pdf.open_metadata()",
  "        xmp = {key: str(meta[key]) for key in ('dc:title', 'dc:creator') if key in meta}",
  "    facts = {",
  "        'fields': len(form.Fields) if form is not None and '/Fields' in form else 0,",
  "        'widgets': sum(1 for page in pdf.pages for a in page.obj.get('/Annots', []) if a.get('/Subtype') == '/Widget'),",
  "        'info': {str(k)[1:]: str(v) for k, v in info.items()} if info is not None else {},",
  "        'has_xmp': '/Metadata' in pdf.Root or any('/Metadata' in page.obj for page in pdf.pages),",
  "        'xmp': xmp,",
  "    }",
  "facts['text'] = ' '.join(page.extract_text() or '' for page in PdfReader(sys.argv[1]).pages)",
  "print(json.dumps(facts))",
].join("\n");

export type PdfFacts = {
  fields: number;
  widgets: number;
  info: Record<string, string>;
  has_xmp: boolean;
  xmp: Record<string, string>;
  text: string;
};

export function readPdfFacts(pdf: Buffer): PdfFacts {
  const folder = mkdtempSync(join(tmpdir(), "e2e-pdf-"));
  try {
    const source = join(folder, "output.pdf");
    writeFileSync(source, pdf);
    return JSON.parse(runPython(FACTS_SCRIPT, [source]).toString("utf8")) as PdfFacts;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
