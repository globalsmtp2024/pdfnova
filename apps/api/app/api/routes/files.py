import time
from collections.abc import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.deps import ContainerDep, SessionDep
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
