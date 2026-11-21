import asyncio
import io
import json
from pathlib import Path

from PIL import Image

from app.container import Container
from app.files.inspect import inspect_document
from tests.conftest import CsrfClient
from tests.pdf_factory import (
    make_attachment_pdf,
    make_encrypted_pdf,
    make_form_pdf,
    make_mixed_pdf,
    make_pdf,
    make_scanned_pdf,
    pdf_bytes,
)


def test_inspection_reports_structure(fixtures_dir: Path) -> None:
    mixed = inspect_document(make_mixed_pdf(fixtures_dir / "mixed.pdf"))
    assert mixed["page_count"] == 3
    assert [page["rotation"] for page in mixed["pages"]] == [0, 90, 0]
    assert mixed["pages"][0]["width_mm"] == 209.9 or abs(mixed["pages"][0]["width_mm"] - 210) < 0.5
    assert mixed["pages"][2]["width_pt"] == 842
    assert mixed["encrypted"] is False and mixed["permissions"]["print"] is True
    assert mixed["scanned"] is False
    assert inspect_document(make_form_pdf(fixtures_dir / "form.pdf"))["has_forms"] is True
    attached = inspect_document(make_attachment_pdf(fixtures_dir / "attach.pdf"))
    assert attached["has_attachments"] is True and attached["title"] == "Quarterly report"
    outlined = inspect_document(make_pdf(fixtures_dir / "outlined.pdf", 3, "O", outline=True))
    assert outlined["has_bookmarks"] is True
    assert inspect_document(make_scanned_pdf(fixtures_dir / "scan.pdf"))["scanned"] is True


def test_inspection_errors(fixtures_dir: Path) -> None:
    import pytest

    from app.files.inspect import InspectionError

    locked = make_encrypted_pdf(fixtures_dir / "locked.pdf", "pw-123456")
    with pytest.raises(InspectionError) as caught:
        inspect_document(locked)
    assert caught.value.code == "PDF_ENCRYPTED"
    assert inspect_document(locked, "pw-123456")["encrypted"] is True
    broken = fixtures_dir / "broken.pdf"
    broken.write_bytes(b"%PDF-1.7\nnothing useful")
    with pytest.raises(InspectionError) as broken_error:
        inspect_document(broken)
    assert broken_error.value.code == "PDF_CORRUPT"


async def _upload(client: CsrfClient, tool: str, name: str, data: bytes) -> tuple[str, str]:
    task = (await client.post("/api/v1/tasks", json={"tool": tool})).json()
    response = await client.post(
        f"/api/v1/tasks/{task['id']}/files", files={"file": (name, data, "application/pdf")}
    )
    assert response.status_code == 201, response.text
    return task["id"], response.json()["id"]


async def test_inspect_and_thumbnail_endpoints(client: CsrfClient, container: Container) -> None:
    task_id, file_id = await _upload(client, "merge", "doc.pdf", pdf_bytes(3, "Thumb"))
    inspected = (await client.post(f"/api/v1/files/{file_id}/inspect")).json()
    assert inspected["page_count"] == 3
    response = await client.get(f"/api/v1/files/{file_id}/pages/2/thumbnail?width=200")
    assert response.status_code == 200 and response.headers["content-type"] == "image/webp"
    image = Image.open(io.BytesIO(response.content))
    assert image.width == 192
    assert container.storage.exists(f"tasks/{task_id}/thumbs/{file_id}/00002-192.webp")
    cached = await client.get(f"/api/v1/files/{file_id}/pages/2/thumbnail?width=200")
    assert cached.content == response.content
    assert (await client.get(f"/api/v1/files/{file_id}/pages/9/thumbnail")).status_code == 404
    batch = await client.get(f"/api/v1/files/{file_id}/thumbnails?width=96&start=1&count=10")
    lines = [json.loads(line) for line in batch.text.strip().splitlines()]
    assert [line["page"] for line in lines] == [1, 2, 3] and all("webp" in line for line in lines)
    await client.delete(f"/api/v1/tasks/{task_id}")
    assert not container.storage.exists(f"tasks/{task_id}/thumbs/{file_id}/00002-192.webp")
    assert (await client.get(f"/api/v1/files/{file_id}/pages/1/thumbnail")).status_code == 404


async def test_concurrent_thumbnails_share_one_local_copy(client: CsrfClient, container: Container) -> None:
    _, file_id = await _upload(client, "split", "burst.pdf", pdf_bytes(6, "Burst"))
    responses = await asyncio.gather(
        *(client.get(f"/api/v1/files/{file_id}/pages/{page}/thumbnail?width=128") for page in range(1, 7))
    )
    assert [response.status_code for response in responses] == [200] * 6
    render_dir = container.settings.work_root.resolve() / "render"
    assert sorted(path.name for path in render_dir.glob(f"{file_id}*")) == [f"{file_id}.pdf"]


async def test_huge_page_is_capped(client: CsrfClient, fixtures_dir: Path) -> None:
    import pikepdf

    path = fixtures_dir / "huge.pdf"
    with pikepdf.new() as pdf:
        pdf.add_blank_page(page_size=(14400, 14400))
        pdf.save(path)
    _, file_id = await _upload(client, "merge", "huge.pdf", path.read_bytes())
    response = await client.get(f"/api/v1/files/{file_id}/pages/1/thumbnail?width=1024")
    assert response.status_code == 200
    image = Image.open(io.BytesIO(response.content))
    assert image.width * image.height <= 4_000_000


async def test_other_people_cannot_see_previews(client: CsrfClient, settings, container: Container) -> None:
    import httpx

    from app.main import create_app

    _, file_id = await _upload(client, "merge", "doc.pdf", pdf_bytes(1, "P"))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app(settings, container)), base_url="http://testserver"
    ) as stranger:
        assert (await stranger.get(f"/api/v1/files/{file_id}/pages/1/thumbnail")).status_code == 404


async def test_thumbnail_rerenders_when_cache_vanishes_mid_read(
    client: CsrfClient, container: Container, monkeypatch
) -> None:
    from app.storage.base import ObjectNotFoundError

    _, file_id = await _upload(client, "split", "vanish.pdf", pdf_bytes(2, "V"))
    first = await client.get(f"/api/v1/files/{file_id}/pages/1/thumbnail?width=128")
    assert first.status_code == 200
    storage = container.storage
    original = storage.iter_bytes

    def vanished(key: str):
        if "/thumbs/" in key:
            raise ObjectNotFoundError(key)
        return original(key)

    monkeypatch.setattr(storage, "iter_bytes", vanished)
    again = await client.get(f"/api/v1/files/{file_id}/pages/1/thumbnail?width=128")
    assert again.status_code == 200 and again.headers["content-type"] == "image/webp"
