from datetime import timedelta
from pathlib import Path

import httpx
from sqlalchemy import update

from app.container import Container
from app.db.base import utcnow
from app.jobs.queue import InlineQueue
from app.main import create_app
from app.models.task import Task
from tests.conftest import CsrfClient
from tests.pdf_factory import pdf_bytes
from tests.qpdf_check import assert_qpdf_ok
from tests.test_tasks_api import create_task, run_to_completion, upload


async def _merged(client: CsrfClient, queue: InlineQueue) -> dict:
    task = await create_task(client)
    await upload(client, task["id"], "a.pdf", pdf_bytes(2, "A"))
    await upload(client, task["id"], "b.pdf", pdf_bytes(1, "B"))
    result = await run_to_completion(client, queue, task["id"])
    assert result["status"] == "succeeded", result
    return result


async def test_output_chains_into_next_tool_on_the_server(
    client: CsrfClient, inline_queue: InlineQueue, tmp_path: Path
) -> None:
    merged = await _merged(client, inline_queue)
    output = merged["outputs"][0]
    rotate = await create_task(client, "rotate")
    chained = await client.post(f"/api/v1/tasks/{rotate['id']}/chain", json={"output_file_id": output["id"]})
    assert chained.status_code == 201, chained.text
    body = chained.json()
    assert body["status"] == "ready" and body["page_count"] == 3 and body["filename"] == "merged.pdf"
    assert body["id"] != output["id"]
    result = await run_to_completion(client, inline_queue, rotate["id"], {"angle": 180})
    assert result["status"] == "succeeded", result
    assert result["inputs"][0]["size"] == output["size"]
    assert result["input_bytes"] == output["size"]
    download = await client.get(result["outputs"][0]["download_url"])
    target = tmp_path / "rotated.pdf"
    target.write_bytes(download.content)
    assert_qpdf_ok(target)


async def test_chaining_is_limited_to_the_owner(
    client: CsrfClient, inline_queue: InlineQueue, settings, container: Container
) -> None:
    merged = await _merged(client, inline_queue)
    async with CsrfClient(
        transport=httpx.ASGITransport(app=create_app(settings, container)), base_url="http://testserver"
    ) as stranger:
        await stranger.get("/api/v1/auth/csrf")
        task = (await stranger.post("/api/v1/tasks", json={"tool": "rotate"})).json()
        response = await stranger.post(
            f"/api/v1/tasks/{task['id']}/chain",
            json={"output_file_id": merged["outputs"][0]["id"]},
        )
        assert response.status_code == 404


async def test_expired_or_deleted_outputs_cannot_be_chained(
    client: CsrfClient, inline_queue: InlineQueue, container: Container
) -> None:
    merged = await _merged(client, inline_queue)
    async with container.database.session() as session:
        await session.execute(
            update(Task).where(Task.id == merged["id"]).values(expires_at=utcnow() - timedelta(seconds=1))
        )
        await session.commit()
    target = await create_task(client, "rotate")
    expired = await client.post(
        f"/api/v1/tasks/{target['id']}/chain", json={"output_file_id": merged["outputs"][0]["id"]}
    )
    assert expired.status_code == 409 and "expired" in expired.json()["error"]["message"]
    fresh = await _merged(client, inline_queue)
    await client.delete(f"/api/v1/tasks/{fresh['id']}")
    deleted = await client.post(
        f"/api/v1/tasks/{target['id']}/chain", json={"output_file_id": fresh["outputs"][0]["id"]}
    )
    assert deleted.status_code in {404, 409}


async def test_only_ready_outputs_of_supported_kinds_chain(
    client: CsrfClient, inline_queue: InlineQueue
) -> None:
    merged = await _merged(client, inline_queue)
    target = await create_task(client, "rotate")
    input_id = merged["inputs"][0]["id"]
    as_input = await client.post(f"/api/v1/tasks/{target['id']}/chain", json={"output_file_id": input_id})
    assert as_input.status_code == 404
    split = await create_task(client, "split")
    await upload(client, split["id"], "c.pdf", pdf_bytes(4, "C"))
    parts = await run_to_completion(client, inline_queue, split["id"], {"mode": "each"})
    archive = next(item for item in parts["outputs"] if item["kind"] == "archive")
    rejected = await client.post(
        f"/api/v1/tasks/{target['id']}/chain", json={"output_file_id": archive["id"]}
    )
    assert rejected.status_code == 415 or rejected.status_code == 422
    missing = await client.post(f"/api/v1/tasks/{target['id']}/chain", json={"output_file_id": "nope"})
    assert missing.status_code == 404
