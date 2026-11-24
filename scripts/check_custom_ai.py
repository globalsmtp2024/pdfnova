import io
import sys
import time
import uuid

import httpx
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

BASE = "http://127.0.0.1:8000"
STUB = "http://127.0.0.1:8799"


def pdf_bytes() -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.drawString(72, 760, "Custom provider check")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def main(allow_private: bool) -> int:
    client = httpx.Client(base_url=BASE, timeout=120)
    client.get("/api/v1/auth/csrf")
    client.headers["x-csrf-token"] = client.cookies.get("pn_csrf") or ""
    email = f"custom-{uuid.uuid4().hex[:8]}@example.com"
    registered = client.post(
        "/api/v1/auth/register", json={"email": email, "password": "correct-horse-battery", "display_name": "T"}
    )
    if registered.status_code != 201:
        print("register failed", registered.status_code, registered.text[:200])
        return 1
    client.headers["x-csrf-token"] = client.cookies.get("pn_csrf") or ""
    body = {"provider": "custom", "base_url": STUB + "/v1", "model": "local-model", "api_key": ""}
    tested = client.post("/api/v1/me/ai-key/test", json=body).json()
    print("test connection:", tested)
    if not allow_private:
        return 0 if (not tested["ok"] and "private network" in tested["message"]) else 1
    if not tested["ok"]:
        return 1
    saved = client.put("/api/v1/me/ai-key", json=body)
    print("save:", saved.status_code, saved.json().get("ai_key"))
    if saved.status_code != 200 or "api_key" in saved.text:
        return 1
    missing = client.put("/api/v1/me/ai-key", json={**body, "base_url": "ftp://x"})
    print("bad url:", missing.status_code, missing.json()["error"]["message"])
    task = client.post("/api/v1/tasks", json={"tool": "ai-summarize"}).json()
    client.post(
        f"/api/v1/tasks/{task['id']}/files", files=[("file", ("a.pdf", pdf_bytes(), "application/pdf"))]
    )
    started = client.post(f"/api/v1/tasks/{task['id']}/start", json={"options": {}})
    print("start:", started.status_code)
    for _ in range(120):
        result = client.get(f"/api/v1/tasks/{task['id']}").json()
        if result["status"] in {"succeeded", "failed"}:
            break
        time.sleep(0.5)
    print("task:", result["status"], result.get("error_message"))
    if result["status"] != "succeeded":
        return 1
    text = client.get(result["outputs"][0]["download_url"]).text
    print("output:", text.strip()[:60])
    return 0 if "Stub answer" in text else 1


if __name__ == "__main__":
    sys.exit(main(allow_private=sys.argv[1] == "private"))
