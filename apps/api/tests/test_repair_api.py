import zlib
from pathlib import Path

from app.jobs.queue import InlineQueue
from tests.conftest import CsrfClient
from tests.pdf_factory import corrupt_variants
from tests.qpdf_check import assert_qpdf_ok
from tests.test_tasks_api import create_task, run_to_completion, upload


async def test_damaged_upload_only_accepted_by_repair(
    client: CsrfClient, inline_queue: InlineQueue, tmp_path: Path
) -> None:
    damaged = corrupt_variants(tmp_path / "variants")["truncated"].read_bytes()
    rotate = await create_task(client, "rotate")
    rejected = await upload(client, rotate["id"], "broken.pdf", damaged)
    assert rejected.get("status") != "ready"

    task = await create_task(client, "repair")
    accepted = await upload(client, task["id"], "broken.pdf", damaged)
    assert accepted["status"] == "ready" and accepted["kind"] == "pdf"
    result = await run_to_completion(client, inline_queue, task["id"])
    assert result["status"] == "succeeded", result
    outputs = {output["filename"]: output for output in result["outputs"]}
    assert "repair-report.txt" in outputs
    repaired = outputs["broken-repaired.pdf"]
    assert repaired["page_count"] == 6
    download = await client.get(repaired["download_url"])
    target = tmp_path / "repaired.pdf"
    target.write_bytes(download.content)
    assert_qpdf_ok(target)
    report = await client.get(outputs["repair-report.txt"]["download_url"])
    assert "Repair report" in report.text


def _damaged_bomb(decoded_megabytes: int) -> bytes:
    compressor = zlib.compressobj(9)
    block = b"\x00" * (1024 * 1024)
    payload = b"".join(compressor.compress(block) for _ in range(decoded_megabytes)) + compressor.flush()
    header = f"2 0 obj\n<< /Length {len(payload)} /Filter /FlateDecode >>\nstream\n".encode()
    return b"%PDF-1.7\n1 0 obj\n<< /Type /Catalgx >>\nendobj\n" + header + payload + b"\nendstream\nendobj\n"


async def test_repair_upload_still_blocks_damaged_bombs(client: CsrfClient) -> None:
    task = await create_task(client, "repair")
    rejected = await upload(client, task["id"], "bomb.pdf", _damaged_bomb(600))
    assert rejected.get("status") != "ready"
    assert "unsafe size" in str(rejected)


async def test_repair_upload_still_requires_pdf_bytes(client: CsrfClient) -> None:
    task = await create_task(client, "repair")
    rejected = await upload(client, task["id"], "fake.pdf", b"not a pdf at all " * 100)
    assert rejected.get("status") != "ready"
