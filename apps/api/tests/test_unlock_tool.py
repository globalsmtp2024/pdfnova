import io
import logging
import zipfile
from pathlib import Path
from typing import Any

import pikepdf
import pytest
from pypdf import PdfReader

from app.container import Container
from app.files.pdf_safety import inspect_pdf
from app.files.sniff import FileKind
from app.jobs.queue import InlineQueue
from app.models.task import Task
from app.tools.base import InputFile, InputFileInfo, JobContext, ToolFailedError
from app.tools.registry import get_registry
from app.tools.security.unlock import UnlockTool
from tests.conftest import CsrfClient
from tests.pdf_factory import make_encrypted_pdf, make_pdf, page_texts
from tests.qpdf_check import assert_qpdf_ok
from tests.test_tasks_api import create_task, upload

LIMITS = {"max_pages": 5000, "max_objects": 1_000_000, "max_ratio": 200}
OPEN_PASSWORD = "correct-horse-42"


def make_restricted_pdf(path: Path, owner: str = "owner-only-77") -> Path:
    source = make_pdf(path.with_name("plain-" + path.name), 2, "Restricted")
    restrictions = pikepdf.Permissions(
        extract=False, modify_other=False, print_lowres=False, print_highres=False
    )
    with pikepdf.open(source) as pdf:
        pdf.save(path, encryption=pikepdf.Encryption(owner=owner, user="", R=6, allow=restrictions))
    return path


def _input(path: Path, password: str | None = None, encrypted: bool = False) -> InputFile:
    return InputFile(
        path=path,
        original_name=path.name,
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=path.stat().st_size,
        page_count=2,
        encrypted=encrypted,
        password=password,
    )


def _run(tmp_path: Path, inputs: list[InputFile]) -> list[Any]:
    tool = UnlockTool()
    parsed = tool.parse_options({})
    tool.validate_inputs(
        [InputFileInfo(i.original_name, i.size_bytes, i.kind, i.page_count, i.encrypted) for i in inputs],
        parsed,
    )
    ctx = JobContext(workdir=tmp_path / "work", inputs=inputs, options=parsed)
    return tool.run(ctx)


def _assert_fully_open(path: Path) -> None:
    assert_qpdf_ok(path)
    with pikepdf.open(path) as pdf:
        assert pdf.is_encrypted is False
        allow = pdf.allow
        assert allow.extract and allow.modify_other and allow.print_highres and allow.modify_assembly


def test_registered() -> None:
    assert isinstance(get_registry().get("unlock"), UnlockTool)
    assert UnlockTool.decrypt_inputs is False


def test_owner_restricted_file_opens_without_prompt(fixtures_dir: Path) -> None:
    restricted = make_restricted_pdf(fixtures_dir / "restricted.pdf")
    inspection = inspect_pdf(restricted, **LIMITS)
    assert inspection.encrypted is False and inspection.page_count == 2
    locked = inspect_pdf(make_encrypted_pdf(fixtures_dir / "locked.pdf"), **LIMITS)
    assert locked.encrypted is True


def test_owner_restricted_output_has_full_permissions(tmp_path: Path, fixtures_dir: Path) -> None:
    restricted = make_restricted_pdf(fixtures_dir / "restricted.pdf")
    with pikepdf.open(restricted) as original:
        assert original.is_encrypted and not original.allow.extract
    outputs = _run(tmp_path, [_input(restricted)])
    assert [o.filename for o in outputs] == ["restricted-unlocked.pdf"]
    _assert_fully_open(outputs[0].path)
    assert page_texts(outputs[0].path)[0].startswith("Restricted page 1")


def test_user_password_with_correct_password(tmp_path: Path, fixtures_dir: Path) -> None:
    locked = make_encrypted_pdf(fixtures_dir / "locked.pdf", OPEN_PASSWORD)
    outputs = _run(tmp_path, [_input(locked, OPEN_PASSWORD, encrypted=True)])
    _assert_fully_open(outputs[0].path)
    texts = page_texts(outputs[0].path)
    assert len(texts) == 2 and "Locked page 2" in texts[1]


def test_wrong_password_fails_without_output(tmp_path: Path, fixtures_dir: Path) -> None:
    locked = make_encrypted_pdf(fixtures_dir / "locked.pdf", OPEN_PASSWORD)
    with pytest.raises(ToolFailedError) as caught:
        _run(tmp_path, [_input(locked, "not-it", encrypted=True)])
    assert caught.value.code == "password_required"
    assert "not correct" in caught.value.message and "not-it" not in caught.value.message
    assert not list((tmp_path / "work" / "out").glob("*.pdf"))


def test_missing_password_reports_password_required(tmp_path: Path, fixtures_dir: Path) -> None:
    locked = make_encrypted_pdf(fixtures_dir / "locked.pdf", OPEN_PASSWORD)
    with pytest.raises(ToolFailedError) as caught:
        _run(tmp_path, [_input(locked, None, encrypted=True)])
    assert caught.value.code == "password_required"
    assert "password-protected" in caught.value.message


def test_mixed_batch_reports_failures_and_keeps_the_rest(tmp_path: Path, fixtures_dir: Path) -> None:
    good = make_encrypted_pdf(fixtures_dir / "good.pdf", OPEN_PASSWORD)
    bad = make_encrypted_pdf(fixtures_dir / "bad.pdf", OPEN_PASSWORD)
    missing = make_encrypted_pdf(fixtures_dir / "missing.pdf", OPEN_PASSWORD)
    restricted = make_restricted_pdf(fixtures_dir / "restricted.pdf")
    plain = make_pdf(fixtures_dir / "plain.pdf", 2, "Plain")
    outputs = _run(
        tmp_path,
        [
            _input(good, OPEN_PASSWORD, encrypted=True),
            _input(bad, "wrong-one", encrypted=True),
            _input(missing, None, encrypted=True),
            _input(restricted),
            _input(plain),
        ],
    )
    pdfs = [o for o in outputs if o.mime_type == "application/pdf"]
    assert sorted(o.filename for o in pdfs) == [
        "good-unlocked.pdf",
        "plain-unlocked.pdf",
        "restricted-unlocked.pdf",
    ]
    for output in pdfs:
        _assert_fully_open(output.path)
    report = next(o for o in outputs if o.filename == "processing-report.txt").path.read_text(
        encoding="utf-8"
    )
    assert "bad.pdf" in report and "missing.pdf" in report and "wrong-one" not in report


def test_batch_limit() -> None:
    assert UnlockTool.input_spec.max_files == 50


async def test_api_flow_seals_and_wipes_passwords(
    client: CsrfClient,
    inline_queue: InlineQueue,
    container: Container,
    fixtures_dir: Path,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    task = await create_task(client, "unlock")
    locked = await upload(
        client,
        task["id"],
        "locked.pdf",
        make_encrypted_pdf(fixtures_dir / "locked.pdf", OPEN_PASSWORD).read_bytes(),
    )
    wrong = await upload(
        client,
        task["id"],
        "wrong.pdf",
        make_encrypted_pdf(fixtures_dir / "wrong.pdf", "other-secret-9").read_bytes(),
    )
    restricted = await upload(
        client,
        task["id"],
        "restricted.pdf",
        make_restricted_pdf(fixtures_dir / "restricted.pdf").read_bytes(),
    )
    assert locked["encrypted"] is True and wrong["encrypted"] is True
    assert restricted["encrypted"] is False and restricted["page_count"] == 2
    started = await client.post(
        f"/api/v1/tasks/{task['id']}/start",
        json={"options": {}, "passwords": {locked["id"]: OPEN_PASSWORD, wrong["id"]: "guess-wrong-1"}},
    )
    assert started.status_code == 202, started.text
    async with container.database.session() as session:
        queued = await session.get(Task, task["id"])
        assert queued is not None and queued.secrets_sealed is not None
        assert OPEN_PASSWORD not in str(queued.options) and OPEN_PASSWORD not in queued.secrets_sealed
    await inline_queue.drain()
    result = (await client.get(f"/api/v1/tasks/{task['id']}")).json()
    assert result["status"] == "succeeded", result
    async with container.database.session() as session:
        stored = await session.get(Task, task["id"])
        assert stored is not None and stored.secrets_sealed is None
        assert OPEN_PASSWORD not in str(stored.options)
        assert OPEN_PASSWORD not in (stored.error_message or "")
    assert OPEN_PASSWORD not in caplog.text and "guess-wrong-1" not in caplog.text
    archive = next(o for o in result["outputs"] if o["filename"] == "files.zip")
    download = await client.get(archive["download_url"])
    with zipfile.ZipFile(io.BytesIO(download.content)) as bundle:
        names = sorted(bundle.namelist())
        assert names == ["locked-unlocked.pdf", "processing-report.txt", "restricted-unlocked.pdf"]
        report = bundle.read("processing-report.txt").decode("utf-8")
        assert "wrong.pdf" in report and "not correct" in report and "guess-wrong-1" not in report
        for name in ("locked-unlocked.pdf", "restricted-unlocked.pdf"):
            target = tmp_path / name
            target.write_bytes(bundle.read(name))
            _assert_fully_open(target)
            assert len(PdfReader(str(target)).pages) == 2


async def test_api_single_file_without_password_fails(
    client: CsrfClient, inline_queue: InlineQueue, container: Container, fixtures_dir: Path
) -> None:
    task = await create_task(client, "unlock")
    await upload(
        client,
        task["id"],
        "locked.pdf",
        make_encrypted_pdf(fixtures_dir / "locked.pdf", OPEN_PASSWORD).read_bytes(),
    )
    started = await client.post(f"/api/v1/tasks/{task['id']}/start", json={"options": {}})
    assert started.status_code == 202, started.text
    await inline_queue.drain()
    result = (await client.get(f"/api/v1/tasks/{task['id']}")).json()
    assert result["status"] == "failed" and result["error_code"] == "password_required"
    assert result["outputs"] == []
