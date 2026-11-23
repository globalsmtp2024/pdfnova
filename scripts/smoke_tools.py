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


def images_decode(outputs: list[tuple[str, bytes]]) -> str | None:
    for name, data in outputs:
        if not name.lower().endswith((".png", ".jpg", ".webp")):
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


def main() -> int:
    only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None
    failures = 0
    with httpx.Client(base_url=BASE, timeout=120) as client:
        client.get("/api/v1/auth/csrf")
        client.headers["x-csrf-token"] = client.cookies.get("pn_csrf") or ""
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
