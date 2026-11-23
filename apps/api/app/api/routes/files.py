import time
from collections.abc import Iterator
from datetime import datetime
from urllib.parse import urlencode

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import ContainerDep, SessionDep
from app.api.routes.tasks import TaskServiceDep
from app.core.errors import NotFoundError, PermissionDeniedError
from app.core.security import constant_time_equals
from app.models.task import FileRole, FileStatus, Task, TaskFile
from app.services.tasks import download_signature
from app.storage.base import ObjectNotFoundError
from app.storage.s3 import content_disposition

router = APIRouter(prefix="/api/v1/files", tags=["files"])


@router.get("/{file_id}/download")
async def download_file(
    file_id: str, expires: int, signature: str, session: SessionDep, container: ContainerDep
) -> StreamingResponse:
    if expires < int(time.time()):
        raise PermissionDeniedError(
            "This download link has expired.", hint="Open the task again to get a fresh link."
        )
    if not constant_time_equals(download_signature(file_id, expires), signature):
        raise PermissionDeniedError("This download link is not valid.")
    record = await session.get(TaskFile, file_id)
    if record is None or record.role != FileRole.OUTPUT.value or record.status != FileStatus.READY.value:
        raise NotFoundError("This file does not exist.")
    task = await session.get(Task, record.task_id)
    if task is None or task.files_deleted_at is not None:
        raise NotFoundError(
            "This file has been deleted.", hint="Files are removed automatically for your privacy."
        )
    storage = container.storage
    key = record.storage_key
    if not storage.exists(key):
        raise NotFoundError("This file has been deleted.")

    def body() -> Iterator[bytes]:
        try:
            yield from storage.iter_bytes(key)
        except ObjectNotFoundError:
            return

    return StreamingResponse(
        body(),
        media_type=record.mime_type,
        headers={
            "Content-Disposition": content_disposition(record.original_name),
            "Content-Length": str(record.size_bytes),
            "Cache-Control": "private, no-store",
        },
    )


class ShareRequest(BaseModel):
    hours: int = Field(default=1, ge=1, le=168)


class ShareResponse(BaseModel):
    url: str
    expires_at: datetime


@router.post("/{file_id}/share", response_model=ShareResponse)
async def share_file(
    file_id: str, body: ShareRequest, service: TaskServiceDep, container: ContainerDep
) -> ShareResponse:
    task, record = await service.get_owned_file(file_id)
    if record.role != FileRole.OUTPUT.value or record.status != FileStatus.READY.value:
        raise NotFoundError("This result file does not exist.")
    if task.files_deleted_at is not None:
        raise NotFoundError("This file has been deleted.")
    expires = min(int(time.time()) + body.hours * 3600, int(task.expires_at.timestamp()))
    query = urlencode({"expires": expires, "signature": download_signature(record.id, expires)})
    base = container.settings.public_api_url.rstrip("/")
    return ShareResponse(
        url=f"{base}/api/v1/files/{record.id}/download?{query}",
        expires_at=datetime.fromtimestamp(expires, tz=task.expires_at.tzinfo),
    )
