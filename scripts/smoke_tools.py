import io
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field

import httpx
import pikepdf
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

BASE = "http://127.0.0.1:8000"
PASSWORD = "smoke-pass-123"
Upload = tuple[str, bytes, str]
Check = Callable[[list[tuple[str, bytes]]], str | None]


def sample_pdf(pages: int = 3) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    for number in range(1, pages + 1):
        pdf.drawString(72, 760, f"Smoke page {number}")
        pdf.drawString(72, 700, "The quick brown fox jumps over the lazy dog.")
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def sample_image(fmt: str = "PNG", size: tuple[int, int] = (320, 240)) -> bytes:
    buffer = io.BytesIO()
    Image.effect_noise(size, 60).convert("RGB").save(buffer, format=fmt)
    return buffer.getvalue()


def scan_photo() -> bytes:
    from PIL import ImageDraw

    canvas_image = Image.new("RGB", (900, 700), (70, 60, 50))
    page = Image.new("RGB", (600, 480), (245, 245, 240))
    drawer = ImageDraw.Draw(page)
    for row in range(10):
        drawer.line((30, 40 + row * 40, 570, 40 + row * 40), fill=(20, 20, 20), width=6)
    tilted = page.rotate(3, expand=True, fillcolor=(70, 60, 50))
    canvas_image.paste(tilted, (130, 90))
    buffer = io.BytesIO()
    canvas_image.save(buffer, format="JPEG")
    return buffer.getvalue()


def embedded_font_pdf() -> bytes:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    pdfmetrics.registerFont(TTFont("DejaVuSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4, initialFontName="DejaVuSans", initialFontSize=14)
    pdf.drawString(72, 760, "Archive smoke page")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def pdfa_marked(outputs: list[tuple[str, bytes]]) -> str | None:
    with pikepdf.open(io.BytesIO(outputs[0][1])) as pdf:
        intents = pdf.Root.get("/OutputIntents")
        if not intents or "/DestOutputProfile" not in intents[0]:
            return "missing output intent"
        if pdf.open_metadata().get("pdfaid:part") != "2":
            return "missing pdfaid part"
    return None


def table_pdf() -> bytes:
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

    buffer = io.BytesIO()
    grid = Table([["Item", "Qty", "Price"], ["Pen", "2", "=1+1"], ["Book", "5", "12.50"]])
    grid.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.black)]))
    SimpleDocTemplate(buffer, pagesize=A4).build([grid])
    return buffer.getvalue()


def dup_pdf() -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    for label in ("Alpha", "Alpha", "Beta"):
        pdf.drawString(72, 700, label)
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def image_pdf() -> bytes:
    from reportlab.lib.utils import ImageReader

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.drawImage(ImageReader(io.BytesIO(sample_image("PNG"))), 72, 500, 200, 150)
    pdf.drawString(72, 450, "Caption")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def no_images(outputs: list[tuple[str, bytes]]) -> str | None:
    with pikepdf.open(io.BytesIO(outputs[0][1])) as pdf:
        for obj in pdf.objects:
            if isinstance(obj, pikepdf.Stream) and obj.get("/Subtype") == "/Image":
                return "image remains"
        return None if "Caption" in pdf.pages[0].Contents.read_bytes().decode("latin-1") else "text lost"


def compare_ok(outputs: list[tuple[str, bytes]]) -> str | None:
    names = [name for name, _ in outputs]
    if "comparison-overlay.pdf" not in names:
        return f"overlay missing {names}"
    report = next(data for name, data in outputs if name == "comparison.html").decode("utf-8")
    if "of the page differs" not in report or "data:image/jpeg" not in report:
        return "visual report missing"
    return pdfs_open([o for o in outputs if o[0].endswith(".pdf")])


def pii_pdf() -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    lines = [
        "Contact: jane.doe@example.com",
        "Phone: +92 300 1234567",
        "Card: 4111 1111 1111 1111",
        "Order: 4111 1111 1111 1112",
        "CNIC: 35202-1234567-1",
        "IBAN: GB82 WEST 1234 5698 7654 32",
        "SSN: 123-45-6789",
        "Safe line stays here",
    ]
    for number, line in enumerate(lines):
        pdf.drawString(72, 760 - number * 24, line)
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def pii_redacted_ok(outputs: list[tuple[str, bytes]]) -> str | None:
    import pypdfium2 as pdfium

    names = [name for name, _ in outputs]
    if "redaction-report.txt" not in names:
        return "report missing"
    report = next(data for name, data in outputs if name.endswith(".txt")).decode()
    for label in ("email", "card", "cnic", "iban", "ssn"):
        if f"({label})" not in report:
            return f"{label} not matched: {report}"
    if "jane" in report or "4111" in report:
        return "report leaks content"
    document = pdfium.PdfDocument(next(data for name, data in outputs if name.endswith(".pdf")))
    if document[0].get_textpage().get_text_range().strip():
        return "text remains"
    return None


def page_count(expected: int) -> Check:
    def check(outputs: list[tuple[str, bytes]]) -> str | None:
        with pikepdf.open(io.BytesIO(outputs[0][1])) as pdf:
            return None if len(pdf.pages) == expected else f"expected {expected} pages got {len(pdf.pages)}"

    return check


def subject_image() -> bytes:
    from PIL import ImageDraw

    image = Image.new("RGB", (240, 240), (255, 255, 255))
    ImageDraw.Draw(image).ellipse((60, 60, 180, 180), fill=(200, 30, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_p12(password: str) -> bytes:
    import datetime

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Smoke Signer")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=30))
        .add_extension(x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True)
        .sign(key, hashes.SHA256())
    )
    return pkcs12.serialize_key_and_certificates(
        b"smoke", key, cert, None, serialization.BestAvailableEncryption(password.encode())
    )


def p12_secrets() -> dict:
    import base64

    return {"pkcs12": base64.b64encode(make_p12("smoke-p12-pass")).decode(), "pkcs12_password": "smoke-p12-pass"}


def signed_pdf() -> bytes:
    import base64

    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import signers

    signer = signers.SimpleSigner.load_pkcs12_data(
        base64.b64decode(p12_secrets()["pkcs12"]), other_certs=[], passphrase=b"smoke-p12-pass"
    )
    writer = IncrementalPdfFileWriter(io.BytesIO(sample_pdf(1)))
    output = io.BytesIO()
    signers.PdfSigner(signers.PdfSignatureMetadata(field_name="Sig1"), signer=signer).sign_pdf(writer, output=output)
    return output.getvalue()


def signed_ok(outputs: list[tuple[str, bytes]]) -> str | None:
    from pyhanko.pdf_utils.reader import PdfFileReader

    reader = PdfFileReader(io.BytesIO(outputs[0][1]))
    return None if len(reader.embedded_signatures) == 1 else "no signature found"


def edit_operations() -> list[dict]:
    import base64

    image = base64.b64encode(sample_image("PNG", (60, 40))).decode()
    return [
        {"type": "text", "page": 1, "x": 10, "y": 20, "text": "Edited سلام", "size": 20, "color": "#CC0000"},
        {"type": "image", "page": 1, "x": 50, "y": 50, "width": 20, "height": 10, "image_data": image},
        {"type": "rectangle", "page": 1, "x": 10, "y": 40, "width": 30, "height": 10, "fill": "#DDEEFF"},
        {"type": "ellipse", "page": 2, "x": 10, "y": 40, "width": 30, "height": 10},
        {"type": "line", "page": 2, "x1": 10, "y1": 10, "x2": 60, "y2": 30, "arrow": True},
        {"type": "highlight", "page": 2, "x": 10, "y": 5, "width": 40, "height": 4},
        {"type": "draw", "page": 2, "points": [[10, 60], [20, 65], [35, 62], [50, 70]]},
        {"type": "note", "page": 1, "x": 80, "y": 10, "text": "Check this"},
        {"type": "link", "page": 1, "x": 10, "y": 80, "width": 30, "height": 5, "url": "https://example.com"},
    ]


def edit_ok(outputs: list[tuple[str, bytes]]) -> str | None:
    with pikepdf.open(io.BytesIO(outputs[0][1])) as pdf:
        subtypes = {str(a.get("/Subtype")) for a in pdf.pages[0].get("/Annots", [])}
        return None if {"/Text", "/Link"} <= subtypes else f"annotations missing {subtypes}"


def text_edit_ok(outputs: list[tuple[str, bytes]]) -> str | None:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(outputs[0][1])
    text = document[0].get_textpage().get_text_range()
    if "Replaced heading" not in text or "sleepy" not in text:
        return f"replacement missing: {text!r}"
    if "Smoke page 1" in text or "lazy" in text:
        return f"old text still present: {text!r}"
    return None


def form_specs() -> list[dict]:
    return [
        {"kind": "text", "name": "full_name", "page": 1, "x": 20, "y": 20, "width": 40, "height": 4, "tooltip": "Name"},
        {"kind": "checkbox", "name": "agree", "page": 1, "x": 20, "y": 30, "width": 3, "height": 3},
        {"kind": "radio", "name": "plan", "export_value": "A", "page": 1, "x": 20, "y": 40, "width": 3, "height": 3},
        {"kind": "radio", "name": "plan", "export_value": "B", "page": 1, "x": 30, "y": 40, "width": 3, "height": 3},
        {"kind": "dropdown", "name": "country", "page": 1, "x": 20, "y": 50, "width": 30, "height": 4, "choices": ["PK", "US"]},
        {"kind": "signature", "name": "sig", "page": 1, "x": 20, "y": 60, "width": 30, "height": 6},
    ]


def flat_form_pdf() -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.drawString(72, 700, "Full name:")
    pdf.line(140, 698, 400, 698)
    pdf.drawString(72, 660, "Address:")
    pdf.drawString(140, 660, "______________________")
    pdf.rect(72, 600, 12, 12)
    pdf.drawString(92, 602, "I agree")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def form_fields_ok(outputs: list[tuple[str, bytes]]) -> str | None:
    with pikepdf.open(io.BytesIO(outputs[0][1])) as pdf:
        form = pdf.Root.get("/AcroForm")
        if form is None or not len(form.Fields):
            return "no fields"
        names = {str(f.get("/T")) for f in form.Fields}
        return None if len(names) >= 3 else f"too few fields {names}"


def zip_or_parts(outputs: list[tuple[str, bytes]]) -> str | None:
    pdfs = [name for name, _ in outputs if name.endswith(".pdf")]
    return None if len(pdfs) == 2 else f"expected 2 parts got {pdfs}"


def name_is(expected: str) -> Check:
    def check(outputs: list[tuple[str, bytes]]) -> str | None:
        return None if outputs[0][0] == expected else f"name {outputs[0][0]!r}"

    return check


def pdf_upload(pages: int = 3) -> list[Upload]:
    return [("sample.pdf", sample_pdf(pages), "application/pdf")]


def encrypted(data: bytes, user: str, owner: str) -> bytes:
    with pikepdf.open(io.BytesIO(data)) as source:
        out = io.BytesIO()
        source.save(out, encryption=pikepdf.Encryption(user=user, owner=owner, R=6))
        return out.getvalue()


def damaged(data: bytes) -> bytes:
    return data[: len(data) - 120] + b"\n%garbage"


@dataclass
class Case:
    slug: str
    files: list[Upload]
    options: dict = field(default_factory=dict)
    secrets: dict | None = None
    open_password: str | None = None
    check: Check | None = None


def pdfs_open(outputs: list[tuple[str, bytes]], password: str | None = None) -> str | None:
    pdf_outputs = [(name, data) for name, data in outputs if name.lower().endswith(".pdf")]
    if not pdf_outputs:
        return "no pdf output"
    for name, data in pdf_outputs:
        try:
            with pikepdf.open(io.BytesIO(data), password=password or "") as pdf:
                if len(pdf.pages) < 1:
                    return f"{name} has no pages"
        except Exception as exc:
            return f"{name} does not open: {type(exc).__name__}"
    return None


def nonempty(outputs: list[tuple[str, bytes]]) -> str | None:
    if not outputs or any(not data for _, data in outputs):
        return "empty output"
    return None


def contains_text(needle: str) -> Check:
    def check(outputs: list[tuple[str, bytes]]) -> str | None:
        blob = b" ".join(data for _, data in outputs).decode("utf-8", "ignore")
        return None if needle in blob else f"missing text {needle!r}"

    return check


HTML_SAMPLE = "<!doctype html><html><body><h1>Hello</h1><p>Rendered page</p></body></html>"


def docx_sample() -> bytes:
    from docx import Document

    buffer = io.BytesIO()
    document = Document()
    document.add_paragraph("Office smoke")
    document.save(buffer)
    return buffer.getvalue()


def xlsx_sample() -> bytes:
    from openpyxl import Workbook

    buffer = io.BytesIO()
    book = Workbook()
    book.active.append(["Name", "Total"])
    book.active.append(["Smoke", 42])
    book.save(buffer)
    return buffer.getvalue()


def pptx_sample() -> bytes:
    from pptx import Presentation

    buffer = io.BytesIO()
    deck = Presentation()
    slide = deck.slides.add_slide(deck.slide_layouts[5])
    slide.shapes.title.text = "Office smoke"
    deck.save(buffer)
    return buffer.getvalue()


def zip_has(member: str) -> Check:
    import zipfile

    def check(outputs: list[tuple[str, bytes]]) -> str | None:
        try:
            with zipfile.ZipFile(io.BytesIO(outputs[0][1])) as archive:
                return None if member in archive.namelist() else f"missing {member}"
        except zipfile.BadZipFile:
            return "not a zip container"

    return check


def images_decode(outputs: list[tuple[str, bytes]]) -> str | None:
    for name, data in outputs:
        if not name.lower().endswith((".png", ".jpg", ".webp", ".tif", ".bmp", ".gif")):
            continue
        try:
            Image.open(io.BytesIO(data)).verify()
        except Exception as exc:
            return f"{name} not an image: {type(exc).__name__}"
    return None


TEXT_SAMPLE = "\n".join(["Hello world", "سلام دنیا", ""])
MARKDOWN_SAMPLE = "\n".join(
    ["# Title", "", "Some *text* here.", "", "- one", "- two", "", "```", "code", "```", ""]
)

def form_pdf() -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.drawString(72, 780, "Form")
    pdf.acroForm.textfield(name="full_name", x=72, y=700, width=300, height=24)
    pdf.acroForm.checkbox(name="agree", x=72, y=650, size=18)
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def redacted_ok(outputs: list[tuple[str, bytes]]) -> str | None:
    problem = pdfs_open(outputs)
    if problem:
        return problem
    with pikepdf.open(io.BytesIO(outputs[0][1])) as pdf:
        blob = b"".join(bytes(page.Contents.read_bytes()) if not isinstance(page.Contents, pikepdf.Array) else b"" for page in pdf.pages[:1])
    return "text still present" if b"fox" in blob or b"Tj" in blob else None


CASES: list[Case] = [
    Case("compress", pdf_upload(), {"level": "recommended"}),
    Case("repair", [("sample.pdf", damaged(sample_pdf()), "application/pdf")]),
    Case("page-numbers", pdf_upload(), {"format": "page_n_of_total"}),
    Case("watermark", pdf_upload(), {"text": "CONFIDENTIAL"}),
    Case("crop", pdf_upload(), {"auto": True}),
    Case("protect", pdf_upload(), {}, {"user_password": PASSWORD}, PASSWORD),
    Case("unlock", [("sample.pdf", encrypted(sample_pdf(), "", "owner-pass"), "application/pdf")]),
    Case("flatten", pdf_upload()),
    Case("edit-metadata", pdf_upload(), {"title": "Smoke", "author": "Tester"}),
    Case("rotate", pdf_upload(), {"angle": 90}),
    Case("split", pdf_upload(), {"mode": "each"}),
    Case("merge", pdf_upload() + pdf_upload()),
    Case(
        "image-to-pdf",
        [("a.png", sample_image("PNG"), "image/png"), ("b.jpg", sample_image("JPEG"), "image/jpeg")],
    ),
    Case("pdf-to-image", pdf_upload(), {"format": "png", "dpi": 72}, check=images_decode),
    Case("pdf-to-text", pdf_upload(), {}, check=contains_text("Smoke page 2")),
    Case("pdf-to-markdown", pdf_upload(), {}, check=contains_text("Smoke page")),
    Case("header-footer", pdf_upload(), {"header_center": "Report {date}", "footer_right": "{n} / {total}"}),
    Case("bates-numbering", pdf_upload(), {"prefix": "ABC-", "digits": 5}),
    Case("background", pdf_upload(), {"mode": "color", "color": "#FFF8DC"}),
    Case("resize-pages", pdf_upload(), {"size": "letter"}),
    Case("n-up", pdf_upload(5), {"per_sheet": 4, "border": True}),
    Case("n-up", pdf_upload(6), {"mode": "booklet"}),
    Case("grayscale", pdf_upload()),
    Case("remove-annotations", pdf_upload()),
    Case("remove-blank-pages", pdf_upload()),
    Case("reverse-pages", pdf_upload()),
    Case("linearize", pdf_upload()),
    Case("bookmarks", pdf_upload(), {"bookmarks": ["Intro | 1", "Details | 2 | 2", "End | 3"]}),
    Case(
        "attachments",
        [("sample.pdf", sample_pdf(), "application/pdf"), ("note.txt", b"attached text", "text/plain")],
    ),
    Case("hyperlinks", pdf_upload(), {"add_links": ["1 | 72 | 700 | 200 | 20 | https://example.com"]}),
    Case("sign", pdf_upload(), {"mode": "text", "text": "A. Tester", "pages": "last"}),
    Case("fill-forms", [("form.pdf", form_pdf(), "application/pdf")], {"values": ["full_name = Ali Khan", "agree = yes"]}),
    Case("redact", pdf_upload(), {"patterns": ["fox"], "boxes": ["1 | 72 | 750 | 100 | 20"]}, check=redacted_ok),
    Case("compare", pdf_upload(2) + [("other.pdf", sample_pdf(3), "application/pdf")], check=compare_ok),
    Case("pdf-to-word", pdf_upload(), {}, check=zip_has("word/document.xml")),
    Case("pdf-to-excel", pdf_upload(), {}, check=zip_has("xl/workbook.xml")),
    Case("html-to-pdf", [("page.html", HTML_SAMPLE.encode("utf-8"), "text/html")]),
    Case("url-to-pdf", [("page.html", HTML_SAMPLE.encode("utf-8"), "text/html")]),
    Case("word-to-pdf", [("doc.docx", docx_sample(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]),
    Case("excel-to-pdf", [("book.xlsx", xlsx_sample(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]),
    Case("powerpoint-to-pdf", [("deck.pptx", pptx_sample(), "application/vnd.openxmlformats-officedocument.presentationml.presentation")]),
    Case("ocr", [("scan.png", sample_image("PNG", (800, 300)), "image/png")]),
    Case("ai-summarize", pdf_upload(), {}, check=contains_text("Stub answer")),
    Case("ai-chat", pdf_upload(), {"questions": ["What is on page 1?"]}, check=contains_text("(p. 1)")),
    Case("ai-translate", pdf_upload(), {"target_language": "Urdu"}),
    Case("ai-smart-redact", pdf_upload(), {}),
    Case("ai-extract-data", pdf_upload(), {"fields": ["title: document title"]}, check=contains_text("Smoke")),
    Case("workflow", pdf_upload(), {"steps": ['rotate {"angle": 90}', "reverse-pages", "linearize"]}),
    Case("image-compress", [("p.jpg", sample_image("JPEG", (900, 700)), "image/jpeg")], {"quality": 50}, check=images_decode),
    Case("image-resize", [("p.png", sample_image("PNG", (800, 600)), "image/png")], {"mode": "percent", "percent": 40}, check=images_decode),
    Case("image-convert", [("p.png", sample_image("PNG"), "image/png")], {"format": "webp"}, check=images_decode),
    Case("image-crop", [("p.png", sample_image("PNG", (800, 600)), "image/png")], {"aspect": "1:1"}, check=images_decode),
    Case("image-rotate", [("p.png", sample_image("PNG", (400, 300)), "image/png")], {"angle": 90}, check=images_decode),
    Case("scan-to-pdf", [("a.jpg", scan_photo(), "image/jpeg"), ("b.jpg", scan_photo(), "image/jpeg")], {"filter": "black_white"}),
    Case("pdf-to-pdfa", [("embedded.pdf", embedded_font_pdf(), "application/pdf")], {"level": "2b"}, check=pdfa_marked),
    Case("pdf-to-powerpoint", pdf_upload(2), {}, check=zip_has("ppt/slides/slide2.xml")),
    Case("pdf-to-html", pdf_upload(2), {}, check=contains_text("Smoke page 1")),
    Case("pdf-to-csv", [("t.pdf", table_pdf(), "application/pdf")], {}, check=contains_text("Book")),
    Case("remove-duplicate-pages", [("d.pdf", dup_pdf(), "application/pdf")], {}, check=page_count(2)),
    Case("remove-images", [("i.pdf", image_pdf(), "application/pdf")], {}, check=no_images),
    Case("remove-hidden-data", pdf_upload(), {}),
    Case("interleave-pages", pdf_upload(3) + [("even.pdf", sample_pdf(3), "application/pdf")], {}, check=page_count(6)),
    Case("image-remove-background", [("p.png", subject_image(), "image/png")], {}, check=images_decode),
    Case("image-watermark", [("p.png", sample_image("PNG", (600, 400)), "image/png")], {"text": "DRAFT", "tile": True}, check=images_decode),
    Case("image-add-text", [("p.png", sample_image("PNG", (600, 400)), "image/png")], {"text": "سلام Hello"}, check=images_decode),
    Case("digital-sign", pdf_upload(1), {"visible": True, "reason": "Smoke"}, secrets=p12_secrets(), check=signed_ok),
    Case("verify-signatures", [("signed.pdf", signed_pdf(), "application/pdf")], {}, check=contains_text("Document unchanged since signing: yes")),
    Case("edit-pdf", pdf_upload(2), {"operations": edit_operations()}, check=edit_ok),
    Case("edit-pdf", pdf_upload(2), {"operations": [{"type": "replace_text", "page": 1, "x": 11, "y": 8, "width": 16, "height": 3, "text": "Replaced heading", "size": 12}, {"type": "find_replace", "find": "lazy", "replace": "sleepy"}]}, check=text_edit_ok),
    Case("create-form", pdf_upload(1), {"fields": form_specs()}, check=form_fields_ok),
    Case("detect-form-fields", [("flat.pdf", flat_form_pdf(), "application/pdf")], {}, check=form_fields_ok),
    Case("redact", [("pii.pdf", pii_pdf(), "application/pdf")], {"presets": ["email", "phone", "card", "cnic", "iban", "ssn"]}, check=pii_redacted_ok),
    Case("ai-smart-split", pdf_upload(3), {}, check=zip_or_parts),
    Case("ai-rename", pdf_upload(1), {}, check=name_is("Smoke test document.pdf")),
    Case("ai-categorize", pdf_upload(1), {}, check=contains_text('"category": "report"')),
    Case("ai-key-dates", pdf_upload(1), {}, check=contains_text("BEGIN:VEVENT")),
    Case("text-to-pdf", [("note.txt", TEXT_SAMPLE.encode("utf-8") * 40, "text/plain")]),
    Case("markdown-to-pdf", [("doc.md", MARKDOWN_SAMPLE.encode("utf-8"), "text/markdown")]),
]


def run_case(client: httpx.Client, case: Case) -> str:
    task = client.post("/api/v1/tasks", json={"tool": case.slug})
    task.raise_for_status()
    task_id = task.json()["id"]
    for name, data, mime in case.files:
        uploaded = client.post(f"/api/v1/tasks/{task_id}/files", files=[("file", (name, data, mime))])
        if uploaded.status_code != 201:
            return f"upload failed {uploaded.status_code}: {uploaded.text[:200]}"
    payload: dict = {"options": case.options}
    if case.secrets:
        payload["secrets"] = case.secrets
    started = client.post(f"/api/v1/tasks/{task_id}/start", json=payload)
    if started.status_code != 202:
        return f"start failed {started.status_code}: {started.text[:300]}"
    deadline = time.time() + 180
    result: dict = {}
    while time.time() < deadline:
        result = client.get(f"/api/v1/tasks/{task_id}").json()
        if result["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.5)
    if result.get("status") != "succeeded":
        return f"job {result.get('status')}: {result.get('error_message')}"
    outputs = [
        (o["filename"], client.get(o["download_url"]).content)
        for o in result["outputs"]
        if o["kind"] != "archive"
    ]
    problem = nonempty(outputs)
    if problem:
        return problem
    if case.check is not None:
        problem = case.check(outputs)
    elif any(n.lower().endswith(".pdf") for n, _ in outputs):
        problem = pdfs_open(outputs, case.open_password)
    return problem or "ok"


def run_share(client: httpx.Client) -> str:
    task = client.post("/api/v1/tasks", json={"tool": "rotate"}).json()
    name, data, mime = pdf_upload()[0]
    client.post(f"/api/v1/tasks/{task['id']}/files", files=[("file", (name, data, mime))])
    client.post(f"/api/v1/tasks/{task['id']}/start", json={"options": {"angle": 90}})
    for _ in range(120):
        result = client.get(f"/api/v1/tasks/{task['id']}").json()
        if result["status"] in {"succeeded", "failed"}:
            break
        time.sleep(0.5)
    if result["status"] != "succeeded":
        return "job failed"
    shared = client.post(f"/api/v1/files/{result['outputs'][0]['id']}/share", json={"hours": 2})
    if shared.status_code != 200:
        return f"share failed {shared.status_code}"
    with httpx.Client(timeout=60) as stranger:
        fetched = stranger.get(shared.json()["url"])
    if fetched.status_code != 200:
        return f"download failed {fetched.status_code}"
    return pdfs_open([("shared.pdf", fetched.content)]) or "ok"


def run_esign(client: httpx.Client) -> str:
    import base64
    import json
    import re
    from pathlib import Path

    email = f"esign-{int(time.time())}@example.com"
    registered = client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD, "display_name": "Owner"})
    if registered.status_code not in {200, 201}:
        return f"register {registered.status_code} {registered.text[:80]}"
    logged = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    if logged.status_code != 200:
        return f"login {logged.status_code} {logged.text[:80]}"
    client.headers["x-csrf-token"] = client.cookies.get("pn_csrf") or client.headers.get("x-csrf-token", "")
    metadata = {
        "title": "Smoke agreement",
        "recipients": [{"name": "Sam Signer", "email": "sam@example.com"}],
        "fields": [
            {"recipient": 0, "kind": "signature", "page": 1, "x": 10, "y": 70, "width": 30, "height": 8},
            {"recipient": 0, "kind": "date", "page": 1, "x": 50, "y": 70, "width": 20, "height": 4},
        ],
    }
    created = client.post(
        "/api/v1/esign/requests",
        files={"file": ("a.pdf", sample_pdf(1), "application/pdf")},
        data={"metadata": json.dumps(metadata)},
    )
    if created.status_code != 201:
        return f"create {created.status_code} {created.text[:120]}"
    request_id = created.json()["id"]
    time.sleep(0.5)
    log_text = Path("/tmp/claude-0/api.log").read_text(errors="ignore")
    tokens = re.findall(r"/sign/([A-Za-z0-9_-]{30,})", log_text)
    if not tokens:
        return "no signing link emailed"
    token = tokens[-1]
    with httpx.Client(base_url=BASE, timeout=60) as signer:
        view = signer.get(f"/api/v1/esign/sign/{token}")
        if view.status_code != 200:
            return f"view {view.status_code}"
        document = signer.get(f"/api/v1/esign/sign/{token}/document")
        if document.status_code != 200 or not document.content.startswith(b"%PDF"):
            return "signer document failed"
        fields = view.json()["fields"]
        mark = base64.b64encode(sample_image("PNG", (200, 60))).decode()
        values = {f["id"]: (mark if f["kind"] == "signature" else "") for f in fields}
        done = signer.post(f"/api/v1/esign/sign/{token}/submit", json={"values": values, "consent": True})
        if done.status_code != 200 or not done.json().get("completed"):
            return f"submit {done.status_code} {done.text[:120]}"
        again = signer.post(f"/api/v1/esign/sign/{token}/submit", json={"values": values, "consent": True})
        if again.status_code == 200:
            return "token was reusable"
    detail = client.get(f"/api/v1/esign/requests/{request_id}").json()
    if detail["status"] != "completed" or not any(e["event"] == "completed" for e in detail["events"]):
        return f"not completed: {detail['status']}"
    final = client.get(f"/api/v1/esign/requests/{request_id}/document")
    if final.status_code != 200:
        return f"download {final.status_code}"
    return pdfs_open([("signed.pdf", final.content)]) or "ok"


def run_workflow_templates(client: httpx.Client) -> str:
    import json
    from pathlib import Path

    templates = json.loads((Path(__file__).resolve().parent.parent / "packages/shared/workflow-templates.json").read_text())
    for template in templates:
        files = [("embedded.pdf", embedded_font_pdf(), "application/pdf")]
        case = Case("workflow", files, {"nodes": template["nodes"], "edges": template["edges"]})
        outcome = run_case(client, case)
        if outcome != "ok":
            return f"{template['slug']}: {outcome}"
    return "ok"


def main() -> int:
    only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None
    failures = 0
    with httpx.Client(base_url=BASE, timeout=120) as client:
        client.get("/api/v1/auth/csrf")
        client.headers["x-csrf-token"] = client.cookies.get("pn_csrf") or ""
        if only and "workflow-templates" in only:
            outcome = run_workflow_templates(client)
            print(f"{'workflow-templates':20} {outcome}")
            failures += outcome != "ok"
        if only and "esign" in only:
            outcome = run_esign(client)
            print(f"{'esign':20} {outcome}")
            failures += outcome != "ok"
        if only and "share" in only:
            outcome = run_share(client)
            print(f"{'share':20} {outcome}")
            failures += outcome != "ok"
        for case in CASES:
            if only and case.slug not in only:
                continue
            try:
                outcome = run_case(client, case)
            except Exception as exc:
                outcome = f"error {type(exc).__name__}: {exc}"
            print(f"{case.slug:20} {outcome}")
            failures += outcome != "ok"
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
