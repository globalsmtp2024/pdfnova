import io
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import pytest
from pypdf import PdfReader
from sqlalchemy import update

from app.container import Container
from app.db.base import utcnow
from app.jobs.queue import InlineQueue
from app.models.task import Task
from tests.conftest import TEST_CHUNK_SIZE, CsrfClient
from tests.pdf_factory import make_encrypted_pdf, pdf_bytes, png_bytes
from tests.qpdf_check import assert_qpdf_ok


async def create_task(client: CsrfClient, tool: str = "merge", **headers: str) -> dict:
    response = await client.post("/api/v1/tasks", json={"tool": tool}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def upload(
    client: CsrfClient, task_id: str, name: str, data: bytes, chunk: int = TEST_CHUNK_SIZE
) -> dict:
    created = await client.post(
        f"/api/v1/tasks/{task_id}/uploads", json={"filename": name, "size": len(data)}
    )
    assert created.status_code == 201, created.text
    upload_id = created.json()["id"]
    offset = 0
    body = created.json()
    while offset < len(data):
        piece = data[offset : offset + chunk]
        response = await client.patch(
            f"/api/v1/uploads/{upload_id}",
            content=piece,
            headers={"Upload-Offset": str(offset), "Content-Type": "application/offset+octet-stream"},
        )
        if response.status_code != 200:
            return {"status_code": response.status_code, **response.json()}
        body = response.json()
        offset += len(piece)
    return body


def big_pdf(pages: int, label: str) -> bytes:
    return pdf_bytes(pages, label)


async def run_to_completion(
    client: CsrfClient,
    queue: InlineQueue,
    task_id: str,
    options: dict | None = None,
    order: list[str] | None = None,
) -> dict:
    payload: dict = {"options": options or {}}
    if order is not None:
        payload["file_order"] = order
    started = await client.post(f"/api/v1/tasks/{task_id}/start", json=payload)
    assert started.status_code == 202, started.text
    await queue.drain()
    return (await client.get(f"/api/v1/tasks/{task_id}")).json()


async def test_list_tools(client: CsrfClient) -> None:
    tools = (await client.get("/api/v1/tools")).json()
    assert any(t["slug"] == "merge" for t in tools)
    assert (await client.get("/api/v1/tools/merge")).json()["name"] == "Merge PDF"
    assert (await client.get("/api/v1/tools/nope")).status_code == 404


async def test_full_merge_flow_with_chunked_upload(
    client: CsrfClient, inline_queue: InlineQueue, tmp_path: Path
) -> None:
    task = await create_task(client)
    assert task["status"] == "created"
    first = big_pdf(40, "First")
    assert len(first) > TEST_CHUNK_SIZE
    a = await upload(client, task["id"], "first.pdf", first)
    b = await upload(client, task["id"], "second.pdf", big_pdf(2, "Second"))
    assert a["status"] == "ready" and a["kind"] == "pdf" and a["page_count"] == 40
    head = await client.head(f"/api/v1/uploads/{a['id']}")
    assert head.headers["upload-offset"] == str(len(first))
    pending = (await client.get(f"/api/v1/tasks/{task['id']}")).json()
    assert pending["estimated_seconds"] > 0 and len(pending["inputs"]) == 2

    result = await run_to_completion(
        client, inline_queue, task["id"], {"files": [{}, {"pages": "1-2"}]}, order=[b["id"], a["id"]]
    )
    assert result["status"] == "succeeded", result
    assert result["progress"] == 1.0 and result["output_bytes"] > 0
    assert len(result["outputs"]) == 1
    output = result["outputs"][0]
    assert output["filename"] == "merged.pdf"
    download = await client.get(output["download_url"])
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/pdf"
    assert "merged.pdf" in download.headers["content-disposition"]
    downloaded = tmp_path / "downloaded.pdf"
    downloaded.write_bytes(download.content)
    assert_qpdf_ok(downloaded)
    reader = PdfReader(io.BytesIO(download.content))
    texts = [page.extract_text() for page in reader.pages]
    assert len(texts) == 4
    assert "Second page 1" in texts[0] and "First page 1" in texts[2] and "First page 2" in texts[3]


async def test_sse_streams_progress_until_done(client: CsrfClient, inline_queue: InlineQueue) -> None:
    task = await create_task(client)
    await upload(client, task["id"], "a.pdf", big_pdf(3, "A"))
    await upload(client, task["id"], "b.pdf", big_pdf(3, "B"))
    await client.post(f"/api/v1/tasks/{task['id']}/start", json={"options": {}})
    events: list[tuple[str, dict]] = []
    async with client.stream("GET", f"/api/v1/tasks/{task['id']}/events") as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        assert "no-transform" in response.headers["cache-control"]
        assert "content-encoding" not in response.headers
        event_name = ""
        async for line in response.aiter_lines():
            if line.startswith("event: "):
                event_name = line[7:]
            elif line.startswith("data: "):
                events.append((event_name, json.loads(line[6:])))
    await inline_queue.drain()
    assert events[-1] == ("done", {"status": "succeeded"})
    progress_events = [data for name, data in events if name == "progress"]
    assert progress_events[-1]["status"] == "succeeded" and progress_events[-1]["progress"] == 1.0


async def test_download_links_are_signed_and_expire(client: CsrfClient, inline_queue: InlineQueue) -> None:
    task = await create_task(client)
    await upload(client, task["id"], "a.pdf", big_pdf(1, "A"))
    await upload(client, task["id"], "b.pdf", big_pdf(1, "B"))
    result = await run_to_completion(client, inline_queue, task["id"])
    url = urlparse(result["outputs"][0]["download_url"])
    file_id = url.path.split("/")[-2]
    tampered = await client.get(f"{url.path}?{url.query.replace('signature=', 'signature=x')}")
    assert tampered.status_code == 403
    expired = await client.get(
        f"/api/v1/files/{file_id}/download?expires={int(time.time()) - 5}&signature=abc"
    )
    assert expired.status_code == 403 and "expired" in expired.json()["error"]["message"]


async def test_upload_validation(client: CsrfClient, fixtures_dir: Path) -> None:
    task = await create_task(client)
    rejected = await upload(client, task["id"], "photo.pdf", png_bytes())
    assert rejected["status_code"] == 415
    assert "cannot open" in rejected["error"]["message"]
    locked = make_encrypted_pdf(fixtures_dir / "locked.pdf").read_bytes()
    locked_result = await upload(client, task["id"], "locked.pdf", locked)
    assert locked_result["status_code"] == 415 and "password-protected" in locked_result["error"]["message"]
    current = (await client.get(f"/api/v1/tasks/{task['id']}")).json()
    assert current["inputs"] == []

    data = big_pdf(40, "X")
    created = (
        await client.post(
            f"/api/v1/tasks/{task['id']}/uploads", json={"filename": "x.pdf", "size": len(data)}
        )
    ).json()
    wrong_offset = await client.patch(
        f"/api/v1/uploads/{created['id']}", content=data[:TEST_CHUNK_SIZE], headers={"Upload-Offset": "10"}
    )
    assert wrong_offset.status_code == 409 and wrong_offset.json()["error"]["details"]["expected_offset"] == 0
    short_chunk = await client.patch(
        f"/api/v1/uploads/{created['id']}", content=data[:100], headers={"Upload-Offset": "0"}
    )
    assert short_chunk.status_code == 422
    too_big = await client.patch(
        f"/api/v1/uploads/{created['id']}",
        content=data[: TEST_CHUNK_SIZE + 1],
        headers={"Upload-Offset": "0"},
    )
    assert too_big.status_code == 413
    removed = await client.delete(f"/api/v1/uploads/{created['id']}")
    assert removed.status_code == 204

    oversize = await client.post(
        f"/api/v1/tasks/{task['id']}/uploads", json={"filename": "huge.pdf", "size": 201 * 1024 * 1024}
    )
    assert oversize.status_code == 413
    oversize_error = oversize.json()["error"]
    assert oversize_error["details"] == {"reason": "file_too_large", "limit": 200 * 1024 * 1024}
    assert "200 MB" in oversize_error["message"]
    allowed = await client.post(
        f"/api/v1/tasks/{task['id']}/uploads", json={"filename": "big.pdf", "size": 199 * 1024 * 1024}
    )
    assert allowed.status_code == 201


async def test_start_validation(client: CsrfClient) -> None:
    task = await create_task(client)
    await upload(client, task["id"], "a.pdf", big_pdf(2, "A"))
    one_file = await client.post(f"/api/v1/tasks/{task['id']}/start", json={"options": {}})
    assert one_file.status_code == 422 and "at least 2" in one_file.json()["error"]["message"]
    await upload(client, task["id"], "b.pdf", big_pdf(2, "B"))
    bad_range = await client.post(
        f"/api/v1/tasks/{task['id']}/start", json={"options": {"files": [{"pages": "7"}, {}]}}
    )
    assert bad_range.status_code == 422 and "outside this document" in bad_range.json()["error"]["message"]
    bad_order = await client.post(
        f"/api/v1/tasks/{task['id']}/start", json={"options": {}, "file_order": ["nope"]}
    )
    assert bad_order.status_code == 422
    unknown_tool = await client.post("/api/v1/tasks", json={"tool": "teleport"})
    assert unknown_tool.status_code == 404


async def test_multipart_upload_endpoint(client: CsrfClient, inline_queue: InlineQueue) -> None:
    task = await create_task(client)
    for name in ("a.pdf", "b.pdf"):
        response = await client.post(
            f"/api/v1/tasks/{task['id']}/files", files={"file": (name, big_pdf(30, name), "application/pdf")}
        )
        assert response.status_code == 201 and response.json()["status"] == "ready"
    result = await run_to_completion(client, inline_queue, task["id"])
    assert result["status"] == "succeeded"


async def test_idempotency_key(client: CsrfClient) -> None:
    first = await create_task(client, **{"Idempotency-Key": "abc-123"})
    second = await create_task(client, **{"Idempotency-Key": "abc-123"})
    assert first["id"] == second["id"]
    conflict = await client.post(
        "/api/v1/tasks", json={"tool": "merge"}, headers={"Idempotency-Key": "abc-123"}
    )
    assert conflict.status_code == 201
    third = await create_task(client, **{"Idempotency-Key": "other"})
    assert third["id"] != first["id"]


async def test_tasks_are_private_to_owner(client: CsrfClient, settings, container: Container) -> None:
    import httpx

    from app.main import create_app

    task = await create_task(client)
    stranger_transport = httpx.ASGITransport(app=create_app(settings, container))
    async with httpx.AsyncClient(transport=stranger_transport, base_url="http://testserver") as stranger:
        assert (await stranger.get(f"/api/v1/tasks/{task['id']}")).status_code == 404


@pytest.mark.parametrize(
    ("limits", "reason", "window"),
    [
        ({"hourly_tasks": 3, "daily_tasks": 100}, "tasks_per_hour", timedelta(hours=1)),
        ({"hourly_tasks": 100, "daily_tasks": 3}, "tasks_per_day", timedelta(days=1)),
    ],
)
async def test_fair_use_task_caps_report_reset_time(
    client: CsrfClient, container: Container, fair_use_override, limits, reason, window
) -> None:
    fair_use_override(**limits)
    first_queued = utcnow() - timedelta(minutes=10)
    for index in range(3):
        task = await create_task(client)
        async with container.database.session() as session:
            await session.execute(
                update(Task)
                .where(Task.id == task["id"])
                .values(queued_at=first_queued + timedelta(minutes=index), status="succeeded")
            )
            await session.commit()
    task = await create_task(client)
    await upload(client, task["id"], "a.pdf", big_pdf(1, "A"))
    await upload(client, task["id"], "b.pdf", big_pdf(1, "B"))
    blocked = await client.post(f"/api/v1/tasks/{task['id']}/start", json={"options": {}})
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    error = blocked.json()["error"]
    assert error["code"] == "fair_use_limit" and error["details"]["reason"] == reason
    reset_at = datetime.fromisoformat(error["details"]["reset_at"])
    assert abs(reset_at - (first_queued + window)) < timedelta(seconds=2)
    assert "UTC" in error["message"]
    text = (error["message"] + error["hint"]).lower()
    assert all(word not in text for word in ("upgrade", "plan", "pro", "pay"))
    usage = (await client.get("/api/v1/usage")).json()
    key = "hourly_tasks" if reason == "tasks_per_hour" else "daily_tasks"
    assert usage[key]["used"] == 3 and usage[key]["limit"] == 3


async def test_cancel_and_delete(client: CsrfClient, inline_queue: InlineQueue, container: Container) -> None:
    created = await create_task(client)
    cancelled = (await client.post(f"/api/v1/tasks/{created['id']}/cancel")).json()
    assert cancelled["status"] == "cancelled"

    task = await create_task(client)
    await upload(client, task["id"], "a.pdf", big_pdf(1, "A"))
    await upload(client, task["id"], "b.pdf", big_pdf(1, "B"))
    result = await run_to_completion(client, inline_queue, task["id"])
    download_url = result["outputs"][0]["download_url"]
    assert (await client.delete(f"/api/v1/tasks/{task['id']}")).status_code == 204
    after = (await client.get(f"/api/v1/tasks/{task['id']}")).json()
    assert after["files_deleted"] is True and after["outputs"][0]["download_url"] is None
    assert (await client.get(download_url)).status_code == 404
    assert not container.storage.exists(f"tasks/{task['id']}/in/{after['inputs'][0]['id']}")


async def test_queued_task_cancelled_before_run(client: CsrfClient, container: Container) -> None:
    task = await create_task(client)
    await upload(client, task["id"], "a.pdf", big_pdf(1, "A"))
    await upload(client, task["id"], "b.pdf", big_pdf(1, "B"))
    async with container.database.session() as session:
        await session.execute(
            update(Task).where(Task.id == task["id"]).values(status="queued", cancel_requested=True)
        )
        await session.commit()
    await container.engine.execute(task["id"])
    assert (await client.get(f"/api/v1/tasks/{task['id']}")).json()["status"] == "cancelled"


async def test_retention_sweeper_deletes_expired_files(
    client: CsrfClient, inline_queue: InlineQueue, container: Container
) -> None:
    task = await create_task(client)
    a = await upload(client, task["id"], "a.pdf", big_pdf(1, "A"))
    await upload(client, task["id"], "b.pdf", big_pdf(1, "B"))
    result = await run_to_completion(client, inline_queue, task["id"])
    assert result["status"] == "succeeded"
    expires = utcnow() + timedelta(minutes=59)
    assert abs((utcnow() + timedelta(hours=1)) - expires) < timedelta(minutes=2)
    report = await container.sweeper.run_once()
    assert report.expired_tasks == 0
    async with container.database.session() as session:
        await session.execute(
            update(Task).where(Task.id == task["id"]).values(expires_at=utcnow() - timedelta(seconds=1))
        )
        await session.commit()
    report = await container.sweeper.run_once()
    assert report.expired_tasks == 1 and report.deleted_objects >= 3
    assert not container.storage.exists(f"tasks/{task['id']}/in/{a['id']}")
    after = (await client.get(f"/api/v1/tasks/{task['id']}")).json()
    assert after["files_deleted"] is True
    assert {item["filename"] for item in after["inputs"] + after["outputs"]} == {"deleted file"}
    async with container.database.session() as session:
        await session.execute(
            update(Task).where(Task.id == task["id"]).values(created_at=utcnow() - timedelta(hours=49))
        )
        await session.commit()
    await container.sweeper.run_once()
    assert (await client.get(f"/api/v1/tasks/{task['id']}")).status_code == 404


async def test_sweeper_reaps_stuck_tasks(client: CsrfClient, container: Container) -> None:
    task = await create_task(client)
    async with container.database.session() as session:
        await session.execute(
            update(Task)
            .where(Task.id == task["id"])
            .values(status="running", started_at=utcnow() - timedelta(hours=2))
        )
        await session.commit()
    report = await container.sweeper.run_once()
    assert report.reaped_tasks == 1
    assert (await client.get(f"/api/v1/tasks/{task['id']}")).json()["error_code"] == "worker_lost"


async def test_signed_in_users_can_extend_retention(client: CsrfClient, container: Container) -> None:
    guest_task = await create_task(client)
    guest_window = datetime.fromisoformat(guest_task["expires_at"]) - datetime.fromisoformat(
        guest_task["created_at"]
    )
    assert abs(guest_window - timedelta(hours=1)) < timedelta(seconds=5)
    await client.post(
        "/api/v1/auth/register", json={"email": "keeper@example.com", "password": "Sturdy-Passphrase-42"}
    )
    updated = (await client.patch("/api/v1/me", json={"retention_extended": True})).json()
    assert updated["retention_extended"] is True and updated["retention_seconds"] == 86400
    task = await create_task(client)
    window = datetime.fromisoformat(task["expires_at"]) - datetime.fromisoformat(task["created_at"])
    assert abs(window - timedelta(hours=24)) < timedelta(seconds=5)
    async with container.database.session() as session:
        stored = await session.get(Task, task["id"])
        assert stored is not None and stored.retention_seconds == 86400


async def test_public_fair_use_policy_and_no_plans(client: CsrfClient) -> None:
    policy = (await client.get("/api/v1/fair-use")).json()
    assert policy["max_file_bytes"] == 200 * 1024 * 1024 and policy["max_files_per_task"] == 100
    assert policy["retention_seconds"] == 3600 and policy["extended_retention_seconds"] == 86400
    assert (await client.get("/api/v1/plans")).status_code == 404
    tools = (await client.get("/api/v1/tools")).json()
    assert all("required_features" not in tool for tool in tools)


@pytest.mark.parametrize("path", ["/health/live", "/health/ready", "/metrics"])
async def test_health_endpoints(client: CsrfClient, path: str) -> None:
    response = await client.get(path)
    assert response.status_code == 200


async def test_migrations_apply_cleanly(tmp_path: Path) -> None:
    import asyncio

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect
    from sqlalchemy.ext.asyncio import create_async_engine

    url = f"sqlite+aiosqlite:///{(tmp_path / 'migrated.db').as_posix()}"
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    config.attributes["database_url"] = url
    await asyncio.to_thread(command.upgrade, config, "head")
    engine = create_async_engine(url)
    async with engine.connect() as connection:
        tables = await connection.run_sync(lambda sync: set(inspect(sync).get_table_names()))
    await engine.dispose()
    assert {
        "users",
        "tasks",
        "task_files",
        "refresh_tokens",
        "oauth_accounts",
        "one_time_tokens",
        "recovery_codes",
    } <= tables
    await asyncio.to_thread(command.downgrade, config, "base")
