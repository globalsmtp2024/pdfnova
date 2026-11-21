import asyncio
import base64
import json
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import ContainerDep, enforce_rate_limit
from app.api.routes.tasks import TaskServiceDep
from app.container import Container
from app.core.errors import AppError, ConflictError, NotFoundError
from app.files.inspect import InspectionError, inspect_document
from app.files.render import RenderError, normalize_width
from app.files.sniff import FileKind
from app.models.task import FileStatus, TaskFile
from app.storage.base import ObjectNotFoundError, validate_key

router = APIRouter(prefix="/api/v1/files", tags=["pages"], dependencies=[Depends(enforce_rate_limit)])

MAX_BATCH = 50


class PdfFileError(AppError):
    status_code = 422


class InspectRequest(BaseModel):
    password: str | None = Field(default=None, max_length=1024)


def _render_cache_dir(container: Container) -> Path:
    path = container.settings.work_root.resolve() / "render"
    path.mkdir(parents=True, exist_ok=True)
    return path


def local_copy_path(container: Container, record: TaskFile) -> Path:
    return _render_cache_dir(container) / f"{record.id}.pdf"


_COPY_LOCKS: dict[str, asyncio.Lock] = {}


async def ensure_local_copy(container: Container, record: TaskFile) -> Path:
    path = local_copy_path(container, record)
    if path.exists():
        return path
    lock = _COPY_LOCKS.setdefault(record.id, asyncio.Lock())
    async with lock:
        if not path.exists():
            temporary = path.with_name(f"{record.id}.{uuid.uuid4().hex}.part")
            try:
                await asyncio.to_thread(container.storage.get_file, record.storage_key, temporary)
                try:
                    temporary.replace(path)
                except PermissionError:
                    if not path.exists():
                        raise
            finally:
                temporary.unlink(missing_ok=True)
    _COPY_LOCKS.pop(record.id, None)
    return path


def thumbnail_key(record: TaskFile, page: int, width: int) -> str:
    return validate_key(f"tasks/{record.task_id}/thumbs/{record.id}/{page:05d}-{width}.webp")


async def _owned_pdf(file_id: str, service: Any) -> TaskFile:
    task, record = await service.get_owned_file(file_id)
    if task.files_deleted_at is not None or record.status != FileStatus.READY.value:
        raise NotFoundError("This file has been deleted.")
    if record.kind != FileKind.PDF.value:
        raise PdfFileError("Only PDF files can be previewed.")
    record_with_task: TaskFile = record
    return record_with_task


@router.post("/{file_id}/inspect")
async def inspect_file(
    file_id: str, service: TaskServiceDep, container: ContainerDep, body: InspectRequest | None = None
) -> dict[str, Any]:
    record = await _owned_pdf(file_id, service)
    password = body.password if body else None
    if record.inspection is not None and not password:
        return record.inspection
    path = await ensure_local_copy(container, record)
    try:
        result = await asyncio.to_thread(inspect_document, path, password)
    except InspectionError as exc:
        error = PdfFileError(exc.message, details={"reason": exc.code})
        error.code = exc.code
        raise error from exc
    if not password:
        await service.save_inspection(record, result)
    return result


async def _render(container: Container, record: TaskFile, page: int, width: int) -> bytes:
    key = thumbnail_key(record, page, width)
    if await asyncio.to_thread(container.storage.exists, key):
        try:
            return b"".join(await asyncio.to_thread(lambda: list(container.storage.iter_bytes(key))))
        except ObjectNotFoundError:
            pass
    if record.encrypted:
        raise ConflictError("Previews aren't available for password-protected PDFs.")
    path = await ensure_local_copy(container, record)
    try:
        data = await container.renderer.render(str(path), page - 1, width)
    except RenderError as exc:
        error = PdfFileError(exc.message, details={"reason": exc.code, "page": page})
        error.code = exc.code
        raise error from exc
    try:
        await asyncio.to_thread(container.storage.put_bytes, key, data)
    except PermissionError:
        if not await asyncio.to_thread(container.storage.exists, key):
            raise
    return data


def _check_page(record: TaskFile, page: int) -> None:
    if record.page_count is not None and not 1 <= page <= record.page_count:
        raise NotFoundError(f"This document has {record.page_count} pages.")


@router.get("/{file_id}/pages/{page}/thumbnail")
async def page_thumbnail(
    file_id: str,
    page: int,
    service: TaskServiceDep,
    container: ContainerDep,
    width: Annotated[int, Query(ge=16, le=4096)] = 240,
) -> Response:
    record = await _owned_pdf(file_id, service)
    _check_page(record, page)
    data = await _render(container, record, page, normalize_width(width))
    return Response(content=data, media_type="image/webp", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/{file_id}/thumbnails")
async def batch_thumbnails(
    file_id: str,
    service: TaskServiceDep,
    container: ContainerDep,
    width: Annotated[int, Query(ge=16, le=4096)] = 160,
    start: Annotated[int, Query(ge=1)] = 1,
    count: Annotated[int, Query(ge=1, le=MAX_BATCH)] = 20,
) -> StreamingResponse:
    record = await _owned_pdf(file_id, service)
    total = record.page_count or 0
    last = min(start + count - 1, total)
    normalized = normalize_width(width)

    async def stream() -> AsyncIterator[str]:
        for page in range(start, last + 1):
            try:
                data = await _render(container, record, page, normalized)
                yield json.dumps({"page": page, "webp": base64.b64encode(data).decode("ascii")}) + "\n"
            except AppError as exc:
                yield json.dumps({"page": page, "error": exc.code}) + "\n"

    return StreamingResponse(
        stream(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store"}
    )
