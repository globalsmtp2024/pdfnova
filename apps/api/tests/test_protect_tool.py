import io
import logging
import zipfile
from pathlib import Path

import pikepdf
import pytest
from sqlalchemy import select, update

from app.container import Container
from app.files.sniff import FileKind
from app.jobs.queue import InlineQueue
from app.models.task import Task
from app.tools.base import InputFile, InputFileInfo, JobContext, ToolFailedError
from app.tools.pdfkit import decrypt_inputs
from app.tools.registry import get_registry
from app.tools.security.protect import ProtectTool
from tests.conftest import CsrfClient
from tests.pdf_factory import make_encrypted_pdf, make_pdf, pdf_bytes
from tests.qpdf_check import assert_qpdf_ok
from tests.test_tasks_api import create_task, upload

USER_SECRET = "Open-Sesame-7731"
OWNER_SECRET = "Owner-Key-99821"


def _input(path: Path, password: str | None = None, encrypted: bool = False) -> InputFile:
    with pikepdf.open(path, password=password or "") as pdf:
        count = len(pdf.pages)
    return InputFile(
        path=path,
        original_name=path.name,
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=path.stat().st_size,
        page_count=count,
        encrypted=encrypted,
        password=password,
    )


def _run(tmp_path: Path, inputs: list[InputFile], secrets: dict[str, str], **options: bool) -> list[Path]:
    tool = ProtectTool()
    parsed = tool.parse_options(dict(options))
    tool.validate_inputs(
        [InputFileInfo(i.original_name, i.size_bytes, i.kind, i.page_count) for i in inputs], parsed
    )
    workdir = tmp_path / "work"
    ctx = JobContext(
        workdir=workdir, inputs=decrypt_inputs(inputs, workdir), options=parsed, secrets=dict(secrets)
    )
    ctx.scratch_dir.mkdir(parents=True, exist_ok=True)
    outputs = tool.run(ctx)
    assert ctx.secrets == {}
    return [output.path for output in outputs]


def _assert_locked(path: Path, user: str) -> None:
    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(path)
    assert_qpdf_ok(path, password=user)


def test_registered_and_defaults(tmp_path: Path) -> None:
    tool = get_registry().get("protect")
    assert isinstance(tool, ProtectTool)
    assert tool.required_secrets == {"user_password"}
    assert "password" not in str(tool.describe()["options_schema"]).lower()


def test_protects_with_aes256_and_all_permissions(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "plain.pdf", 3, "Plain")
    [output] = _run(tmp_path, [_input(source)], {"user_password": USER_SECRET})
    assert output.name == "plain-protected.pdf"
    _assert_locked(output, USER_SECRET)
    with pikepdf.open(output, password=USER_SECRET) as pdf:
        assert pdf.is_encrypted and len(pdf.pages) == 3
        assert pdf.encryption.R == 6 and pdf.encryption.stream_method.name == "aesv3"
        assert pdf.allow.extract and pdf.allow.print_highres and pdf.allow.modify_other
        assert pdf.owner_password_matched is False


def test_permissions_and_owner_password(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "plain.pdf", 2, "Plain")
    [output] = _run(
        tmp_path,
        [_input(source)],
        {"user_password": USER_SECRET, "owner_password": OWNER_SECRET},
        allow_copy=False,
        allow_print_high_quality=False,
        allow_modify=False,
        allow_annotate=False,
        allow_fill_forms=False,
        allow_assemble=False,
    )
    _assert_locked(output, USER_SECRET)
    assert_qpdf_ok(output, password=OWNER_SECRET)
    with pikepdf.open(output, password=USER_SECRET) as pdf:
        allow = pdf.allow
        assert not allow.extract and not allow.print_highres and allow.print_lowres
        assert not allow.modify_other and not allow.modify_annotation and not allow.modify_form
        assert not allow.modify_assembly and allow.accessibility
    with pikepdf.open(output, password=OWNER_SECRET) as pdf:
        assert pdf.owner_password_matched


def test_no_print_disables_high_quality(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "plain.pdf", 1, "Plain")
    [output] = _run(tmp_path, [_input(source)], {"user_password": USER_SECRET}, allow_print=False)
    _assert_locked(output, USER_SECRET)
    with pikepdf.open(output, password=USER_SECRET) as pdf:
        assert not pdf.allow.print_lowres and not pdf.allow.print_highres


def test_batch_uses_same_password(tmp_path: Path) -> None:
    inputs = [_input(make_pdf(tmp_path / f"doc{i}.pdf", i + 1, f"D{i}")) for i in range(3)]
    outputs = _run(tmp_path, inputs, {"user_password": USER_SECRET})
    assert len(outputs) == 3
    for output in outputs:
        _assert_locked(output, USER_SECRET)


def test_reencrypts_already_encrypted_input(tmp_path: Path) -> None:
    locked = make_encrypted_pdf(tmp_path / "locked.pdf", "old-pass")
    [output] = _run(tmp_path, [_input(locked, "old-pass", encrypted=True)], {"user_password": USER_SECRET})
    _assert_locked(output, USER_SECRET)
    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(output, password="old-pass")


def test_wrong_input_password_fails(tmp_path: Path) -> None:
    locked = make_encrypted_pdf(tmp_path / "locked.pdf", "old-pass")
    item = InputFile(
        locked, "locked.pdf", FileKind.PDF, "application/pdf", 1, 2, encrypted=True, password="x"
    )
    with pytest.raises(ToolFailedError):
        _run(tmp_path, [item], {"user_password": USER_SECRET})


def test_missing_secret_fails_cleanly(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "plain.pdf", 1, "Plain")
    with pytest.raises(ToolFailedError) as caught:
        _run(tmp_path, [_input(source)], {})
    assert caught.value.code == "secret_missing"


def test_overlong_password_rejected_without_echo(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "plain.pdf", 1, "Plain")
    secret = "Z" * 200
    with pytest.raises(ToolFailedError) as caught:
        _run(tmp_path, [_input(source)], {"user_password": secret})
    assert caught.value.code == "password_too_long" and secret not in caught.value.message


def test_secrets_hidden_from_repr(tmp_path: Path) -> None:
    ctx = JobContext(
        workdir=tmp_path,
        inputs=[],
        options=ProtectTool().parse_options({}),
        secrets={"user_password": "Hidden-1"},
    )
    assert "Hidden-1" not in repr(ctx)


async def test_api_flow_keeps_password_sealed(
    client: CsrfClient,
    inline_queue: InlineQueue,
    container: Container,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    caplog.set_level(logging.DEBUG)
    task = await create_task(client, "protect")
    await upload(client, task["id"], "a.pdf", pdf_bytes(2, "A"))
    await upload(client, task["id"], "b.pdf", pdf_bytes(1, "B"))
    started = await client.post(
        f"/api/v1/tasks/{task['id']}/start",
        json={
            "options": {"allow_copy": False},
            "secrets": {"user_password": USER_SECRET, "owner_password": OWNER_SECRET},
        },
    )
    assert started.status_code == 202, started.text
    assert USER_SECRET not in started.text
    async with container.database.session() as session:
        stored = (await session.scalars(select(Task).where(Task.id == task["id"]))).one()
        assert stored.secrets_sealed is not None and USER_SECRET not in stored.secrets_sealed
        assert USER_SECRET not in str(stored.options) and OWNER_SECRET not in str(stored.options)
    await inline_queue.drain()
    result = (await client.get(f"/api/v1/tasks/{task['id']}")).json()
    assert result["status"] == "succeeded", (result["error_code"], result["error_message"])
    async with container.database.session() as session:
        stored = (await session.scalars(select(Task).where(Task.id == task["id"]))).one()
        assert stored.secrets_sealed is None
        assert stored.options["allow_copy"] is False
    bundle = next(o for o in result["outputs"] if o["filename"] == "files.zip")
    archive = zipfile.ZipFile(io.BytesIO((await client.get(bundle["download_url"])).content))
    for name in archive.namelist():
        target = tmp_path / name
        target.write_bytes(archive.read(name))
        _assert_locked(target, USER_SECRET)
        with pikepdf.open(target, password=USER_SECRET) as pdf:
            assert not pdf.allow.extract
    logged = caplog.text + capsys.readouterr().out
    assert USER_SECRET not in logged and OWNER_SECRET not in logged


async def test_api_rejects_missing_and_unknown_secrets(client: CsrfClient) -> None:
    task = await create_task(client, "protect")
    await upload(client, task["id"], "a.pdf", pdf_bytes(1, "A"))
    missing = await client.post(f"/api/v1/tasks/{task['id']}/start", json={"options": {}})
    assert missing.status_code == 422 and "needs a password" in missing.json()["error"]["message"]
    unknown = await client.post(
        f"/api/v1/tasks/{task['id']}/start",
        json={"options": {}, "secrets": {"user_password": USER_SECRET, "api_token": USER_SECRET}},
    )
    assert unknown.status_code == 422 and USER_SECRET not in unknown.text
    too_long = await client.post(
        f"/api/v1/tasks/{task['id']}/start", json={"options": {}, "secrets": {"user_password": "Q" * 600}}
    )
    assert too_long.status_code == 422 and "Q" * 600 not in too_long.text
    merge = await create_task(client, "merge")
    await upload(client, merge["id"], "a.pdf", pdf_bytes(1, "A"))
    await upload(client, merge["id"], "b.pdf", pdf_bytes(1, "B"))
    stray = await client.post(
        f"/api/v1/tasks/{merge['id']}/start", json={"options": {}, "secrets": {"user_password": "x"}}
    )
    assert stray.status_code == 422


async def test_job_fails_cleanly_when_secrets_are_gone(client: CsrfClient, container: Container) -> None:
    task = await create_task(client, "protect")
    await upload(client, task["id"], "a.pdf", pdf_bytes(1, "A"))
    async with container.database.session() as session:
        await session.execute(
            update(Task).where(Task.id == task["id"]).values(status="queued", options={}, secrets_sealed=None)
        )
        await session.commit()
    await container.engine.execute(task["id"])
    result = (await client.get(f"/api/v1/tasks/{task['id']}")).json()
    assert result["status"] == "failed" and result["error_code"] == "secret_missing"
    assert "password" in result["error_message"].lower()
