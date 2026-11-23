import io
import sys
import time

import httpx
import pikepdf
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
PASSWORD = "smoke-pass-123"


def sample_pdf(pages: int = 3) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    for number in range(1, pages + 1):
        pdf.drawString(72, 760, f"Smoke page {number}")
        pdf.drawString(72, 700, "The quick brown fox jumps over the lazy dog.")
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def encrypted(data: bytes, user: str, owner: str) -> bytes:
    with pikepdf.open(io.BytesIO(data)) as source:
        out = io.BytesIO()
        source.save(out, encryption=pikepdf.Encryption(user=user, owner=owner, R=6))
        return out.getvalue()


def damaged(data: bytes) -> bytes:
    return data[: len(data) - 120] + b"\n%garbage"


CASES = [
    ("compress", sample_pdf(), {"level": "recommended"}, None, None),
    ("repair", damaged(sample_pdf()), {}, None, None),
    ("page-numbers", sample_pdf(), {"format": "page_n_of_total"}, None, None),
    ("watermark", sample_pdf(), {"text": "CONFIDENTIAL"}, None, None),
    ("crop", sample_pdf(), {"auto": True}, None, None),
    ("protect", sample_pdf(), {}, {"user_password": PASSWORD}, PASSWORD),
    ("unlock", encrypted(sample_pdf(), "", "owner-pass"), {}, None, None),
    ("flatten", sample_pdf(), {}, None, None),
    ("edit-metadata", sample_pdf(), {"title": "Smoke", "author": "Tester"}, None, None),
    ("rotate", sample_pdf(), {"angle": 90}, None, None),
    ("split", sample_pdf(), {"mode": "each"}, None, None),
    ("merge", sample_pdf(), {}, None, None),
]


def run_case(client: httpx.Client, slug: str, data: bytes, options: dict, secrets: dict | None, open_password: str | None) -> str:
    task = client.post("/api/v1/tasks", json={"tool": slug})
    task.raise_for_status()
    task_id = task.json()["id"]
    files = [("file", ("sample.pdf", data, "application/pdf"))]
    uploaded = client.post(f"/api/v1/tasks/{task_id}/files", files=files)
    if uploaded.status_code != 201:
        return f"upload failed {uploaded.status_code}: {uploaded.text[:200]}"
    if slug == "merge":
        again = client.post(f"/api/v1/tasks/{task_id}/files", files=files)
        if again.status_code != 201:
            return f"upload2 failed {again.status_code}"
    payload: dict = {"options": options}
    if secrets:
        payload["secrets"] = secrets
    started = client.post(f"/api/v1/tasks/{task_id}/start", json=payload)
    if started.status_code != 202:
        return f"start failed {started.status_code}: {started.text[:300]}"
    deadline = time.time() + 120
    result: dict = {}
    while time.time() < deadline:
        result = client.get(f"/api/v1/tasks/{task_id}").json()
        if result["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.5)
    if result.get("status") != "succeeded":
        return f"job {result.get('status')}: {result.get('error_message')}"
    outputs = [o for o in result["outputs"] if o["mime_type"] == "application/pdf"]
    if not outputs:
        return "no pdf output"
    for output in outputs:
        content = client.get(output["download_url"]).content
        try:
            with pikepdf.open(io.BytesIO(content), password=open_password or "") as pdf:
                if len(pdf.pages) < 1:
                    return "output has no pages"
        except Exception as exc:
            return f"output does not open: {type(exc).__name__}"
    return "ok"


def main() -> int:
    failures = 0
    with httpx.Client(base_url=BASE, timeout=60) as client:
        client.get("/api/v1/auth/csrf")
        client.headers["x-csrf-token"] = client.cookies.get("pn_csrf") or ""
        for slug, data, options, secrets, open_password in CASES:
            try:
                outcome = run_case(client, slug, data, options, secrets, open_password)
            except Exception as exc:
                outcome = f"error {type(exc).__name__}: {exc}"
            print(f"{slug:15} {outcome}")
            failures += outcome != "ok"
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
