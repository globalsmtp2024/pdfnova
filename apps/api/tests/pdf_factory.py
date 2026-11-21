import io
import zlib
from pathlib import Path

import pikepdf
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def make_pdf(path: Path, pages: int, label: str = "Doc", outline: bool = False) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(path), pagesize=A4)
    pdf.setTitle(label)
    for number in range(1, pages + 1):
        pdf.setFont("Helvetica-Bold", 28)
        pdf.drawString(72, 760, f"{label} page {number}")
        pdf.setFont("Helvetica", 12)
        pdf.drawString(72, 730, "The quick brown fox jumps over the lazy dog.")
        if outline:
            key = f"{label}-{number}"
            pdf.bookmarkPage(key)
            pdf.addOutlineEntry(f"{label} section {number}", key, level=0)
        pdf.showPage()
    pdf.save()
    return path


def pdf_bytes(pages: int, label: str = "Doc") -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    for number in range(1, pages + 1):
        pdf.drawString(72, 760, f"{label} page {number}")
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def make_encrypted_pdf(path: Path, password: str = "secret-pass") -> Path:
    source = make_pdf(path.with_name("plain-" + path.name), 2, "Locked")
    with pikepdf.open(source) as pdf:
        pdf.save(path, encryption=pikepdf.Encryption(owner=password, user=password, R=6))
    return path


def make_flate_bomb_pdf(path: Path, decoded_megabytes: int) -> Path:
    payload = zlib.compress(b"\x00" * (decoded_megabytes * 1024 * 1024), 9)
    with pikepdf.new() as pdf:
        pdf.add_blank_page()
        stream = pikepdf.Stream(pdf, payload)
        stream.Filter = pikepdf.Name.FlateDecode
        pdf.Root.Bomb = pdf.make_indirect(stream)
        pdf.save(path, compress_streams=False)
    return path


def page_texts(path: Path) -> list[str]:
    from pypdf import PdfReader

    return [(page.extract_text() or "") for page in PdfReader(str(path)).pages]


def png_bytes(width: int = 32, height: int = 32) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (91, 75, 255)).save(buffer, format="PNG")
    return buffer.getvalue()


def make_mixed_pdf(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(path))
    for number, size in enumerate([(595, 842), (612, 792), (842, 595)], start=1):
        pdf.setPageSize(size)
        pdf.drawString(72, size[1] - 72, f"Mixed page {number}")
        pdf.showPage()
    pdf.save()
    with pikepdf.open(path, allow_overwriting_input=True) as document:
        document.pages[1].rotate(90, relative=False)
        document.save(path)
    return path


def make_form_pdf(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(path), pagesize=A4)
    pdf.drawString(72, 780, "Application form")
    pdf.acroForm.textfield(name="full_name", x=72, y=700, width=300, height=24, value="Ayesha Khan")
    pdf.acroForm.checkbox(name="agree", x=72, y=650, size=18, checked=True)
    pdf.showPage()
    pdf.save()
    return path


def make_attachment_pdf(path: Path) -> Path:
    source = make_pdf(path.with_name("plain-" + path.name), 1, "Attach")
    with pikepdf.open(source) as pdf:
        pdf.attachments["notes.txt"] = pikepdf.AttachedFileSpec(pdf, b"hidden notes")
        pdf.Root.OpenAction = pikepdf.Dictionary(S=pikepdf.Name.JavaScript, JS=pikepdf.String("app.alert(1)"))
        pdf.docinfo["/Author"] = "Secret Author"
        pdf.docinfo["/Title"] = "Quarterly report"
        pdf.save(path)
    return path


def make_image_pdf(path: Path, pages: int = 2, size: int = 1600) -> Path:
    import random

    path.parent.mkdir(parents=True, exist_ok=True)
    rng = random.Random(7)
    pdf = canvas.Canvas(str(path), pagesize=A4)
    for number in range(pages):
        image = Image.new("RGB", (size, size))
        pixels = image.load()
        for x in range(0, size, 4):
            for y in range(0, size, 4):
                color = (rng.randrange(256), (x * 255) // size, (y * 255) // size)
                for dx in range(4):
                    for dy in range(4):
                        pixels[x + dx, y + dy] = color
        image_path = path.with_name(f"photo-{number}.png")
        image.save(image_path)
        pdf.drawImage(str(image_path), 40, 200, width=500, height=500)
        pdf.drawString(72, 780, f"Photo page {number + 1}")
        pdf.showPage()
    pdf.save()
    return path


def make_scanned_pdf(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    image_path = path.with_name("scan.png")
    Image.new("L", (800, 1100), 245).save(image_path)
    pdf = canvas.Canvas(str(path), pagesize=A4)
    pdf.drawImage(str(image_path), 0, 0, width=595, height=842)
    pdf.showPage()
    pdf.save()
    return path


def corrupt_variants(directory: Path) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    good = make_pdf(directory / "good.pdf", 6, "Repair").read_bytes()
    xref = good.rfind(b"xref")
    variants = {
        "truncated": good[: int(len(good) * 0.8)],
        "bad_xref": good[:xref] + b"xref\n0 999\ngarbage\n" + good[xref + 40 :],
        "garbage_appended": good + b"\n%% trailing garbage " + b"\x00\xff" * 200,
        "no_trailer": good[: good.rfind(b"trailer")],
    }
    paths: dict[str, Path] = {}
    for name, data in variants.items():
        paths[name] = directory / f"{name}.pdf"
        paths[name].write_bytes(data)
    return paths
