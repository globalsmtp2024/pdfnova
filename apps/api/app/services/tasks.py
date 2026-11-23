import asyncio
import hashlib
import shutil
import time
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.crypto import load_key, open_text
from app.core.errors import ConflictError, NotFoundError, ToolInputError, UnsupportedFileError
from app.core.secrets import seal_secrets
from app.core.security import sign_value
from app.db.base import new_id, utcnow
from app.files.pdf_safety import DamagedPdfError, inspect_damaged_pdf, inspect_pdf
from app.files.sniff import FileKind, UnsafeFileError, sniff_file
from app.models.task import FileRole, FileStatus, Task, TaskFile, TaskStatus
from app.schemas.tasks import TaskFileResponse, TaskResponse, UploadResponse
from app.services.erasure import ErasureReport, erase_task_data
from app.services.flags import require_flag
from app.services.principal import Principal
from app.services.quota import (
    ensure_ai_quota,
    ensure_concurrency,
    ensure_file_size,
    ensure_task_capacity,
    ensure_task_rate,
    record_ai_usage,
)
from app.storage.base import task_input_key, upload_part_key
from app.tools.base import InputFileInfo, Tool, safe_filename


def download_signature(file_id: str, expires: int) -> str:
    return sign_value(f"download:{file_id}:{expires}")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class TaskService:
    def __init__(self, session: AsyncSession, container: Container, principal: Principal):
        self._session = session
        self._container = container
        self._settings = container.settings
        self._principal = principal

    async def _find_by_idempotency_key(self, idempotency_key: str) -> Task | None:
        existing: Task | None = await self._session.scalar(
            select(Task).where(
                Task.owner_key == self._principal.owner_key, Task.idempotency_key == idempotency_key
            )
        )
        return existing

    async def create(self, tool_slug: str, idempotency_key: str | None) -> Task:
        tool = self._container.registry.get(tool_slug)
        if idempotency_key:
            existing = await self._find_by_idempotency_key(idempotency_key)
            if existing is not None:
                if existing.tool_slug != tool_slug:
                    raise ConflictError("This idempotency key was already used for a different tool.")
                return existing
        retention = self._principal.retention_seconds
        task = Task(
            owner_key=self._principal.owner_key,
            user_id=self._principal.user.id if self._principal.user else None,
            client_ip_hash=self._principal.client_ip_hash,
            tool_slug=tool.slug,
            retention_seconds=retention,
            priority=self._principal.priority,
            api_key_id=self._principal.api_key_id,
            idempotency_key=idempotency_key,
            expires_at=utcnow() + timedelta(seconds=retention),
        )
        self._session.add(task)
        try:
            await self._session.commit()
        except IntegrityError:
            await self._session.rollback()
            if idempotency_key:
                existing = await self._find_by_idempotency_key(idempotency_key)
                if existing is not None:
                    return existing
            raise
        await self._session.refresh(task, ["files"])
        return task

    async def get_owned(self, task_id: str) -> Task:
        task: Task | None = await self._session.get(Task, task_id)
        if task is None or task.owner_key != self._principal.owner_key:
            raise NotFoundError("This task does not exist or has been deleted.")
        await self._session.refresh(task, ["files"])
        return task

    async def get_owned_file(self, file_id: str) -> tuple[Task, TaskFile]:
        record = await self._session.get(TaskFile, file_id)
        if record is None:
            raise NotFoundError("This upload does not exist.")
        task = await self.get_owned(record.task_id)
        return task, record

    async def save_inspection(self, record: TaskFile, inspection: dict[str, Any]) -> None:
        record.inspection = inspection
        if record.page_count is None:
            record.page_count = inspection.get("page_count")
        await self._session.commit()

    def _tool(self, task: Task) -> Tool[Any]:
        return self._container.registry.get(task.tool_slug)

    async def create_upload(self, task: Task, filename: str, size: int) -> TaskFile:
        if task.state is not TaskStatus.CREATED or task.files_deleted_at is not None:
            raise ConflictError("Files can only be added before the task starts.")
        tool = self._tool(task)
        limits = self._principal.limits
        ensure_file_size(size, limits, tool)
        inputs = task.files_with_role(FileRole.INPUT)
        ensure_task_capacity(len(inputs), sum(f.declared_size for f in inputs), size, limits, tool)
        file_id = new_id()
        record = TaskFile(
            id=file_id,
            task_id=task.id,
            role=FileRole.INPUT.value,
            position=max((f.position for f in inputs), default=-1) + 1,
            original_name=safe_filename(filename),
            storage_key=task_input_key(task.id, file_id),
            declared_size=size,
        )
        self._session.add(record)
        await self._session.commit()
        return record

    async def import_output(self, task: Task, source_file_id: str) -> TaskFile:
        source_task, source = await self.get_owned_file(source_file_id)
        if source.role != FileRole.OUTPUT.value or source.status != FileStatus.READY.value:
            raise NotFoundError("This result file does not exist.")
        if source_task.files_deleted_at is not None or source_task.expires_at <= utcnow():
            raise ConflictError(
                "This result has expired and been deleted.", hint="Run the previous tool again."
            )
        tool = self._tool(task)
        accepted = {kind.value for kind in tool.input_spec.accepted_kinds}
        if source.kind not in accepted:
            raise UnsupportedFileError(
                f"{tool.name} cannot open this type of file.", hint=self._accepted_hint(tool)
            )
        record = await self.create_upload(task, source.original_name, source.size_bytes)
        staging = self._settings.work_root.resolve() / "uploads" / f"{record.id}.chain"
        staging.parent.mkdir(parents=True, exist_ok=True)
        try:
            await asyncio.to_thread(self._container.storage.get_file, source.storage_key, staging)
            await asyncio.to_thread(self._container.storage.put_file, record.storage_key, staging)
        finally:
            staging.unlink(missing_ok=True)
        record.received_bytes = source.size_bytes
        record.size_bytes = source.size_bytes
        record.kind = source.kind
        record.mime_type = source.mime_type
        record.sha256 = source.sha256
        record.page_count = source.page_count
        record.encrypted = bool(source.encrypted)
        record.inspection = source.inspection
        record.status = FileStatus.READY.value
        task.retention_seconds = max(task.retention_seconds, source_task.retention_seconds)
        others = [f for f in task.files_with_role(FileRole.INPUT) if f.id != record.id]
        task.input_bytes = sum(f.size_bytes for f in others) + record.size_bytes
        await self._session.commit()
        return record

    async def receive_chunk(self, task: Task, record: TaskFile, offset: int, data: bytes) -> TaskFile:
        if record.status != FileStatus.UPLOADING.value:
            raise ConflictError("This upload is already complete.")
        if task.state is not TaskStatus.CREATED:
            raise ConflictError("Files can only be added before the task starts.")
        if offset != record.received_bytes:
            raise ConflictError(
                "Upload offset does not match.", details={"expected_offset": record.received_bytes}
            )
        chunk_size = self._settings.upload_chunk_size
        remaining = record.declared_size - record.received_bytes
        if not data or len(data) > chunk_size or len(data) > remaining:
            raise ToolInputError(
                "Chunk size is invalid.", details={"chunk_size": chunk_size, "remaining": remaining}
            )
        if len(data) != chunk_size and len(data) != remaining:
            raise ToolInputError(
                "Only the final chunk may be smaller than the chunk size.", details={"chunk_size": chunk_size}
            )
        index = record.parts_received
        await asyncio.to_thread(
            self._container.storage.put_bytes, upload_part_key(task.id, record.id, index), data
        )
        result = await self._session.execute(
            update(TaskFile)
            .where(
                TaskFile.id == record.id, TaskFile.received_bytes == offset, TaskFile.parts_received == index
            )
            .values(received_bytes=offset + len(data), parts_received=index + 1)
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            await self._session.rollback()
            raise ConflictError("Another upload request changed this file. Resume from the latest offset.")
        await self._session.commit()
        await self._session.refresh(record)
        if record.received_bytes == record.declared_size:
            await self._finalize(task, record)
        return record

    async def _finalize(self, task: Task, record: TaskFile) -> None:
        tool = self._tool(task)
        staging = self._settings.work_root.resolve() / "uploads" / record.id
        assembled = staging / "file"
        part_keys = [upload_part_key(task.id, record.id, i) for i in range(record.parts_received)]
        try:
            await asyncio.to_thread(self._container.storage.append_parts_to, part_keys, assembled)
            if assembled.stat().st_size != record.declared_size:
                raise UnsupportedFileError("The upload is incomplete.", hint="Upload the file again.")
            reason = await asyncio.to_thread(self._inspect, assembled, record, tool)
            if reason is not None:
                await self._reject(record)
                raise UnsupportedFileError(reason, hint=self._accepted_hint(tool))
            await asyncio.to_thread(self._container.storage.put_file, record.storage_key, assembled)
            record.status = FileStatus.READY.value
            record.size_bytes = record.declared_size
            task.input_bytes = sum(f.size_bytes for f in task.files_with_role(FileRole.INPUT))
            await self._session.commit()
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            for key in part_keys:
                await asyncio.to_thread(self._container.storage.delete, key)

    def _inspect(self, path: Path, record: TaskFile, tool: Tool[Any]) -> str | None:
        try:
            sniffed = sniff_file(path, record.original_name)
        except UnsafeFileError as exc:
            return str(exc)
        record.kind = sniffed.kind.value
        record.mime_type = sniffed.mime_type
        record.sha256 = _sha256(path)
        if sniffed.kind not in tool.input_spec.accepted_kinds:
            return f"{tool.name} cannot open this type of file."
        if sniffed.kind is FileKind.PDF:
            limits = {
                "max_pages": self._settings.max_pdf_pages,
                "max_objects": self._settings.max_pdf_objects,
                "max_ratio": self._settings.max_decompression_ratio,
            }
            try:
                try:
                    inspection = inspect_pdf(path, **limits)
                except DamagedPdfError:
                    if not tool.input_spec.allow_damaged_pdf:
                        raise
                    inspection = inspect_damaged_pdf(path, **limits)
            except UnsafeFileError as exc:
                return str(exc)
            if inspection.encrypted and not tool.input_spec.allow_encrypted_pdf:
                return "This PDF is password-protected. Unlock it first with the Unlock PDF tool."
            record.page_count = inspection.page_count
            record.encrypted = inspection.encrypted
        return None

    @staticmethod
    def _accepted_hint(tool: Tool[Any]) -> str:
        kinds = ", ".join(sorted(k.value.upper() for k in tool.input_spec.accepted_kinds))
        return f"Upload one of: {kinds}."

    async def _reject(self, record: TaskFile) -> None:
        await self._session.delete(record)
        await self._session.commit()
        await asyncio.to_thread(self._container.storage.delete, record.storage_key)

    async def remove_upload(self, task: Task, record: TaskFile) -> None:
        if task.state is not TaskStatus.CREATED:
            raise ConflictError("Files can only be removed before the task starts.")
        part_keys = [upload_part_key(task.id, record.id, i) for i in range(record.parts_received)]
        await self._session.delete(record)
        await self._session.commit()
        for key in [record.storage_key, *part_keys]:
            await asyncio.to_thread(self._container.storage.delete, key)

    def input_infos(
        self, files: list[TaskFile], unlocked: frozenset[str] = frozenset()
    ) -> list[InputFileInfo]:
        return [
            InputFileInfo(
                name=f.original_name,
                size_bytes=f.size_bytes,
                kind=FileKind(f.kind),
                page_count=f.page_count,
                encrypted=f.encrypted and f.id not in unlocked,
            )
            for f in files
        ]

    async def start(
        self,
        task: Task,
        options: dict[str, Any],
        file_order: list[str] | None,
        passwords: dict[str, str] | None = None,
        secrets: dict[str, str] | None = None,
    ) -> Task:
        if task.state is not TaskStatus.CREATED:
            if task.state in {TaskStatus.QUEUED, TaskStatus.RUNNING, TaskStatus.SUCCEEDED}:
                return task
            raise ConflictError("This task has already finished.", hint="Create a new task to run again.")
        tool = self._tool(task)
        inputs = task.files_with_role(FileRole.INPUT)
        if any(f.status != FileStatus.READY.value for f in inputs):
            raise ConflictError("Some files are still uploading.", hint="Wait for all uploads to finish.")
        if file_order is not None:
            by_id = {f.id: f for f in inputs}
            if sorted(file_order) != sorted(by_id):
                raise ToolInputError("The file order must list every uploaded file exactly once.")
            for position, file_id in enumerate(file_order):
                by_id[file_id].position = position
            inputs = [by_id[file_id] for file_id in file_order]
        supplied = {key: value for key, value in (passwords or {}).items() if value}
        unknown = set(supplied) - {f.id for f in inputs}
        if unknown:
            raise ToolInputError("A password was sent for a file that is not part of this task.")
        job_secrets = {key: value for key, value in (secrets or {}).items() if value}
        if set(job_secrets) - tool.accepted_secrets:
            raise ToolInputError("This tool does not accept one of the protected values that were sent.")
        if tool.required_secrets - set(job_secrets):
            raise ToolInputError(
                f"{tool.name} needs a password before it can start.", hint="Enter a password and try again."
            )
        parsed = tool.parse_options(options)
        tool.validate_inputs(self.input_infos(inputs, frozenset(supplied)), parsed)
        if tool.uses_ai:
            await require_flag(self._session, "ai_tools")
            job_secrets.update(self._ai_secrets())
        await ensure_task_rate(self._session, self._principal)
        await ensure_concurrency(self._session, self._principal)
        if tool.uses_ai:
            await ensure_ai_quota(self._session, self._principal)
            record_ai_usage(self._session, self._principal, tool.slug)
        now = utcnow()
        task.options = parsed.model_dump(mode="json")
        task.secrets_sealed = (
            seal_secrets(self._settings, {"passwords": supplied, "job": job_secrets})
            if supplied or job_secrets
            else None
        )
        del job_secrets, supplied
        task.status = TaskStatus.QUEUED.value
        task.queued_at = now
        task.progress = 0.0
        task.progress_label = "Waiting in queue"
        task.expires_at = now + timedelta(
            seconds=task.retention_seconds + self._settings.job_timeout_seconds * 3
        )
        await self._session.commit()
        await self._container.queue.enqueue(task.id, task.priority)
        return task

    def _ai_secrets(self) -> dict[str, str]:
        user = self._principal.user
        if user is not None and user.ai_api_key_encrypted is not None:
            key = load_key(self._settings.storage_encryption_key.get_secret_value())
            return {
                "ai_provider": user.ai_provider or "anthropic",
                "ai_key": open_text(key, user.ai_api_key_encrypted),
            }
        shared = self._settings.ai_shared_api_key
        if shared is None:
            raise ToolInputError(
                "AI features are not configured on this server.",
                hint="Add your own AI key in Settings to use them.",
            )
        return {"ai_provider": self._settings.ai_shared_provider, "ai_key": shared.get_secret_value()}

    async def cancel(self, task: Task) -> Task:
        if task.state is TaskStatus.CREATED:
            task.status = TaskStatus.CANCELLED.value
            task.finished_at = utcnow()
        elif task.state in {TaskStatus.QUEUED, TaskStatus.RUNNING}:
            task.cancel_requested = True
        await self._session.commit()
        return task

    async def delete(self, task: Task) -> ErasureReport:
        task.cancel_requested = True
        if not task.state.is_terminal and task.state is not TaskStatus.RUNNING:
            task.status = TaskStatus.CANCELLED.value
            task.finished_at = utcnow()
        report = await erase_task_data(
            self._container.storage, self._settings.work_root, task.id, [file.id for file in task.files]
        )
        task.files_deleted_at = utcnow()
        await self._session.commit()
        return report

    def download_url(self, record: TaskFile) -> str:
        ttl = self._settings.signed_url_ttl_seconds
        presigned = self._container.storage.presigned_download_url(
            record.storage_key, record.original_name, ttl
        )
        if presigned:
            return presigned
        expires = int(time.time()) + ttl
        query = urlencode({"expires": expires, "signature": download_signature(record.id, expires)})
        return f"{self._settings.public_api_url.rstrip('/')}/api/v1/files/{record.id}/download?{query}"

    def to_response(self, task: Task) -> TaskResponse:
        deleted = task.files_deleted_at is not None
        inputs = task.files_with_role(FileRole.INPUT)
        outputs = task.files_with_role(FileRole.OUTPUT)
        estimated: float | None = None
        if (
            task.state is TaskStatus.CREATED
            and inputs
            and all(f.status == FileStatus.READY.value for f in inputs)
        ):
            tool = self._tool(task)
            try:
                estimated = tool.estimate_cost(self.input_infos(inputs), tool.parse_options({})).seconds
            except ToolInputError:
                estimated = None
        return TaskResponse(
            id=task.id,
            tool=task.tool_slug,
            status=task.status,
            progress=task.progress,
            progress_label=task.progress_label,
            error_code=task.error_code,
            error_message=task.error_message,
            created_at=task.created_at,
            started_at=task.started_at,
            finished_at=task.finished_at,
            expires_at=task.expires_at,
            files_deleted=deleted,
            input_bytes=task.input_bytes,
            output_bytes=task.output_bytes,
            estimated_seconds=estimated,
            inputs=[self._file_response(f, with_url=False) for f in inputs],
            outputs=[
                self._file_response(f, with_url=not deleted and task.state is TaskStatus.SUCCEEDED)
                for f in outputs
            ],
        )

    def _file_response(self, record: TaskFile, *, with_url: bool) -> TaskFileResponse:
        return TaskFileResponse(
            id=record.id,
            filename=record.original_name,
            size=record.size_bytes or record.declared_size,
            mime_type=record.mime_type,
            kind=record.kind,
            page_count=record.page_count,
            status=record.status,
            download_url=self.download_url(record) if with_url else None,
        )

    def upload_response(self, record: TaskFile) -> UploadResponse:
        return UploadResponse(
            id=record.id,
            task_id=record.task_id,
            filename=record.original_name,
            size=record.declared_size,
            offset=record.received_bytes,
            chunk_size=self._settings.upload_chunk_size,
            status=record.status,
            kind=record.kind if record.status == FileStatus.READY.value else None,
            page_count=record.page_count,
            encrypted=bool(record.encrypted),
            rejection_reason=record.rejection_reason,
        )
