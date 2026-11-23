import asyncio
import hashlib
import shutil
import threading
import zipfile
from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum
from pathlib import Path
from typing import Any

import pikepdf
from sqlalchemy import select

from app.core.config import Settings
from app.core.logging import get_logger
from app.core.metrics import JOB_DURATION, JOBS_FINISHED
from app.core.secrets import open_secrets
from app.db.base import new_id, utcnow
from app.db.session import Database
from app.fair_use import get_fair_use
from app.files.sniff import FileKind
from app.jobs.sandbox import SandboxError, SandboxLimits, SandboxRequest, SandboxSuccess, run_in_sandbox
from app.models.task import FileRole, FileStatus, Task, TaskFile, TaskStatus
from app.storage.base import Storage, task_output_key
from app.tools.base import InputFile, OutputFile, safe_filename
from app.tools.registry import ToolRegistry

log = get_logger(__name__)


class InfrastructureError(Exception):
    pass


class EngineOutcome(StrEnum):
    COMPLETED = "completed"
    SKIPPED = "skipped"


@dataclass
class _LiveState:
    fraction: float = 0.0
    label: str = "Starting"
    dirty: bool = True
    cancel_requested: bool = False


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _pdf_page_count(path: Path) -> int | None:
    try:
        with pikepdf.open(path) as pdf:
            return len(pdf.pages)
    except (pikepdf.PdfError, pikepdf.PasswordError):
        return None


def _unique_names(outputs: list[OutputFile]) -> list[str]:
    seen: dict[str, int] = {}
    names: list[str] = []
    for output in outputs:
        name = safe_filename(output.filename)
        count = seen.get(name.lower(), 0)
        seen[name.lower()] = count + 1
        if count:
            stem, dot, suffix = name.rpartition(".")
            name = f"{stem} ({count}).{suffix}" if dot else f"{name} ({count})"
        names.append(name)
    return names


def build_zip(outputs: list[OutputFile], names: list[str], target: Path) -> Path:
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for output, name in zip(outputs, names, strict=True):
            archive.write(output.path, arcname=name)
    return target


class JobEngine:
    def __init__(self, settings: Settings, database: Database, storage: Storage, registry: ToolRegistry):
        self._settings = settings
        self._db = database
        self._storage = storage
        self._registry = registry

    async def execute(self, task_id: str) -> EngineOutcome:
        async with self._db.session() as session:
            task = await session.get(Task, task_id)
            if task is None or task.state is not TaskStatus.QUEUED:
                return EngineOutcome.SKIPPED
            if task.cancel_requested:
                self._finish(task, TaskStatus.CANCELLED, "cancelled", "The task was cancelled.")
                await session.commit()
                return EngineOutcome.SKIPPED
            task.status = TaskStatus.RUNNING.value
            task.started_at = utcnow()
            task.attempts += 1
            task.progress = 0.0
            task.progress_label = "Preparing files"
            await session.commit()
            tool_slug = task.tool_slug
            options = dict(task.options)
            opened = open_secrets(self._settings, task.secrets_sealed)
            passwords: dict[str, str] = opened.get("passwords", {})
            job_secrets: dict[str, str] = dict(opened.get("job", {}))
            del opened
            inputs_meta = [
                (
                    f.id,
                    f.storage_key,
                    f.original_name,
                    f.kind,
                    f.mime_type,
                    f.size_bytes,
                    f.page_count,
                    f.encrypted,
                    passwords.get(f.id),
                )
                for f in task.files_with_role(FileRole.INPUT)
                if f.status == FileStatus.READY.value
            ]
            if task.secrets_sealed is not None:
                task.secrets_sealed = None
                await session.commit()
            del passwords
        workdir = self._settings.work_root.resolve() / task_id
        shutil.rmtree(workdir, ignore_errors=True)
        (workdir / "in").mkdir(parents=True)
        (workdir / "scratch").mkdir(parents=True)
        started = asyncio.get_running_loop().time()
        try:
            inputs = await self._download_inputs(workdir, inputs_meta)
            result = await self._run_tool(task_id, tool_slug, workdir, inputs, options, job_secrets)
            if isinstance(result, SandboxSuccess):
                await self._store_outputs(task_id, workdir, result.outputs)
                JOBS_FINISHED.labels(tool_slug, "succeeded").inc()
            else:
                await self._mark_failed(task_id, result)
                JOBS_FINISHED.labels(tool_slug, result.code).inc()
        except InfrastructureError:
            await self._requeue_or_fail(task_id)
            raise
        finally:
            job_secrets.clear()
            JOB_DURATION.labels(tool_slug).observe(asyncio.get_running_loop().time() - started)
            shutil.rmtree(workdir, ignore_errors=True)
        return EngineOutcome.COMPLETED

    async def mark_dead_letter(self, task_id: str) -> None:
        async with self._db.session() as session:
            task = await session.get(Task, task_id)
            if task is None or task.state.is_terminal:
                return
            self._finish(
                task,
                TaskStatus.FAILED,
                "infrastructure_error",
                "We could not process this task due to a temporary problem. Please try again.",
            )
            await session.commit()
        log.error("task_dead_lettered", task_id=task_id)

    async def _download_inputs(self, workdir: Path, inputs_meta: list[tuple[Any, ...]]) -> list[InputFile]:
        inputs: list[InputFile] = []
        for position, (file_id, key, name, kind, mime, size, pages, encrypted, password) in enumerate(
            inputs_meta
        ):
            suffix = Path(name).suffix.lower()[:10]
            local = workdir / "in" / f"{position:04d}_{file_id}{suffix}"
            try:
                await asyncio.to_thread(self._storage.get_file, key, local)
            except Exception as exc:
                raise InfrastructureError("input download failed") from exc
            inputs.append(
                InputFile(
                    path=local,
                    original_name=name,
                    kind=FileKind(kind),
                    mime_type=mime,
                    size_bytes=size,
                    page_count=pages,
                    file_id=file_id,
                    encrypted=encrypted,
                    password=password,
                )
            )
        return inputs

    async def _run_tool(
        self,
        task_id: str,
        tool_slug: str,
        workdir: Path,
        inputs: list[InputFile],
        options: dict[str, Any],
        job_secrets: dict[str, str] | None = None,
    ) -> SandboxSuccess | SandboxError:
        limits = SandboxLimits(
            timeout_seconds=self._settings.job_timeout_seconds,
            memory_mb=self._settings.job_memory_limit_mb,
            max_output_bytes=max(get_fair_use().max_task_bytes * 4, 512 * 1024 * 1024),
        )
        request = SandboxRequest(
            tool_slug=tool_slug,
            workdir=workdir,
            inputs=inputs,
            options=options,
            limits=limits,
            secrets=dict(job_secrets or {}),
        )
        state = _LiveState()
        lock = threading.Lock()

        def on_progress(fraction: float, label: str) -> None:
            with lock:
                state.fraction = fraction
                state.label = label[:120]
                state.dirty = True

        def on_trace(trace: str) -> None:
            log.warning("tool_exception", task_id=task_id, tool=tool_slug, trace=trace)

        runner = asyncio.create_task(
            asyncio.to_thread(run_in_sandbox, request, on_progress, lambda: state.cancel_requested, on_trace)
        )
        while not runner.done():
            await asyncio.wait({runner}, timeout=0.5)
            with lock:
                dirty, fraction, label = state.dirty, state.fraction, state.label
                state.dirty = False
            async with self._db.session() as session:
                task = await session.get(Task, task_id)
                if task is None:
                    state.cancel_requested = True
                    continue
                state.cancel_requested = task.cancel_requested
                if dirty and not runner.done():
                    task.progress = round(min(fraction, 0.99), 4)
                    task.progress_label = label
                    await session.commit()
        request.secrets.clear()
        return runner.result()

    async def _store_outputs(self, task_id: str, workdir: Path, outputs: list[OutputFile]) -> None:
        names = _unique_names(outputs)
        records: list[tuple[str, str, Path, str, str]] = []
        for output, name in zip(outputs, names, strict=True):
            kind = FileKind.PDF.value if output.mime_type == "application/pdf" else "file"
            records.append((new_id(), name, output.path, output.mime_type, kind))
        if len(outputs) > 1:
            archive = build_zip(outputs, names, workdir / "bundle.zip")
            records.append((new_id(), "files.zip", archive, "application/zip", "archive"))
        stored: list[TaskFile] = []
        try:
            for position, (file_id, name, path, mime, kind) in enumerate(records):
                key = task_output_key(task_id, file_id)
                await asyncio.to_thread(self._storage.put_file, key, path)
                size = path.stat().st_size
                stored.append(
                    TaskFile(
                        id=file_id,
                        task_id=task_id,
                        role=FileRole.OUTPUT.value,
                        position=position,
                        original_name=name,
                        storage_key=key,
                        declared_size=size,
                        received_bytes=size,
                        size_bytes=size,
                        mime_type=mime,
                        kind=kind,
                        sha256=await asyncio.to_thread(_sha256, path),
                        page_count=await asyncio.to_thread(_pdf_page_count, path)
                        if kind == FileKind.PDF.value
                        else None,
                        status=FileStatus.READY.value,
                    )
                )
        except Exception as exc:
            raise InfrastructureError("output upload failed") from exc
        async with self._db.session() as session:
            task = await session.get(Task, task_id)
            if task is None or task.cancel_requested:
                for record in stored:
                    await asyncio.to_thread(self._storage.delete, record.storage_key)
                if task is not None:
                    self._finish(task, TaskStatus.CANCELLED, "cancelled", "The task was cancelled.")
                    await session.commit()
                return
            else:
                session.add_all(stored)
                task.output_bytes = sum(f.size_bytes for f in stored if f.kind != "archive")
                task.progress = 1.0
                task.progress_label = "Done"
                self._finish(task, TaskStatus.SUCCEEDED, None, None)
            await session.commit()

    async def _mark_failed(self, task_id: str, error: SandboxError) -> None:
        async with self._db.session() as session:
            task = await session.get(Task, task_id)
            if task is None:
                return
            status = TaskStatus.CANCELLED if error.code == "cancelled" else TaskStatus.FAILED
            self._finish(task, status, error.code, error.message)
            await session.commit()

    async def _requeue_or_fail(self, task_id: str) -> None:
        async with self._db.session() as session:
            task = await session.get(Task, task_id)
            if task is not None and task.state is TaskStatus.RUNNING:
                task.status = TaskStatus.QUEUED.value
                task.progress_label = "Retrying"
                await session.commit()

    def _finish(self, task: Task, status: TaskStatus, code: str | None, message: str | None) -> None:
        now = utcnow()
        task.status = status.value
        task.error_code = code
        task.error_message = message
        task.finished_at = now
        task.expires_at = now + timedelta(seconds=task.retention_seconds)


async def find_stuck_tasks(database: Database, older_than: timedelta) -> list[str]:
    threshold = utcnow() - older_than
    async with database.session() as session:
        rows = await session.scalars(
            select(Task.id).where(Task.status == TaskStatus.RUNNING.value, Task.started_at < threshold)
        )
        return list(rows)
