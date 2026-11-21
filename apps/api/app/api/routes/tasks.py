import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import ContainerDep, PrincipalDep, SessionDep, enforce_rate_limit, limit_by_ip
from app.core.errors import PayloadTooLargeError, ToolInputError
from app.fair_use import get_fair_use
from app.models.task import Task, TaskStatus
from app.schemas.tasks import (
    CreateTaskRequest,
    CreateUploadRequest,
    StartTaskRequest,
    TaskEvent,
    TaskResponse,
    UploadResponse,
)
from app.services.tasks import TaskService

router = APIRouter(prefix="/api/v1", tags=["tasks"], dependencies=[Depends(enforce_rate_limit)])
SSE_POLL_SECONDS = 0.5
SSE_HEARTBEAT_SECONDS = 15.0


def get_task_service(session: SessionDep, container: ContainerDep, principal: PrincipalDep) -> TaskService:
    return TaskService(session, container, principal)


TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]


@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    body: CreateTaskRequest,
    service: TaskServiceDep,
    idempotency_key: Annotated[str | None, Header(max_length=128)] = None,
) -> TaskResponse:
    task = await service.create(body.tool, idempotency_key)
    return service.to_response(task)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, service: TaskServiceDep) -> TaskResponse:
    return service.to_response(await service.get_owned(task_id))


@router.post("/tasks/{task_id}/uploads", response_model=UploadResponse, status_code=201)
async def create_upload(task_id: str, body: CreateUploadRequest, service: TaskServiceDep) -> UploadResponse:
    task = await service.get_owned(task_id)
    record = await service.create_upload(task, body.filename, body.size)
    return service.upload_response(record)


@router.post("/tasks/{task_id}/files", response_model=UploadResponse, status_code=201)
async def upload_whole_file(
    task_id: str, file: UploadFile, service: TaskServiceDep, container: ContainerDep
) -> UploadResponse:
    task = await service.get_owned(task_id)
    size = file.size
    if size is None or size <= 0:
        raise ToolInputError("The uploaded file is empty.")
    record = await service.create_upload(task, file.filename or "document", size)
    chunk_size = container.settings.upload_chunk_size
    offset = 0
    while offset < size:
        data = await file.read(chunk_size)
        if not data:
            break
        record = await service.receive_chunk(task, record, offset, data)
        offset += len(data)
    return service.upload_response(record)


class ChainRequest(BaseModel):
    output_file_id: str = Field(min_length=1, max_length=64)


@router.post("/tasks/{task_id}/chain", response_model=UploadResponse, status_code=201)
async def chain_from_output(task_id: str, body: ChainRequest, service: TaskServiceDep) -> UploadResponse:
    task = await service.get_owned(task_id)
    record = await service.import_output(task, body.output_file_id)
    return service.upload_response(record)


class UrlImportRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)


@router.post("/tasks/{task_id}/imports", response_model=UploadResponse, status_code=201)
async def import_from_url(
    task_id: str, body: UrlImportRequest, request: Request, service: TaskServiceDep, container: ContainerDep
) -> UploadResponse:
    await limit_by_ip(request, container, "url-import", limit=30, window=3600)
    task = await service.get_owned(task_id)
    imported = await container.url_fetcher(body.url, get_fair_use().max_file_bytes)
    record = await service.create_upload(task, imported.filename, len(imported.data))
    chunk_size = container.settings.upload_chunk_size
    for offset in range(0, len(imported.data), chunk_size):
        record = await service.receive_chunk(
            task, record, offset, imported.data[offset : offset + chunk_size]
        )
    return service.upload_response(record)


@router.head("/uploads/{upload_id}")
async def upload_offset(upload_id: str, service: TaskServiceDep) -> Response:
    _, record = await service.get_owned_file(upload_id)
    return Response(
        headers={
            "Upload-Offset": str(record.received_bytes),
            "Upload-Length": str(record.declared_size),
            "Cache-Control": "no-store",
        }
    )


@router.get("/uploads/{upload_id}", response_model=UploadResponse)
async def get_upload(upload_id: str, service: TaskServiceDep) -> UploadResponse:
    _, record = await service.get_owned_file(upload_id)
    return service.upload_response(record)


@router.patch("/uploads/{upload_id}", response_model=UploadResponse)
async def upload_chunk(
    upload_id: str,
    request: Request,
    service: TaskServiceDep,
    container: ContainerDep,
    upload_offset: Annotated[int, Header(alias="Upload-Offset", ge=0)],
) -> UploadResponse:
    task, record = await service.get_owned_file(upload_id)
    limit = container.settings.upload_chunk_size
    buffer = bytearray()
    async for piece in request.stream():
        buffer.extend(piece)
        if len(buffer) > limit:
            raise PayloadTooLargeError("This chunk is larger than allowed.", details={"chunk_size": limit})
    record = await service.receive_chunk(task, record, upload_offset, bytes(buffer))
    return service.upload_response(record)


@router.delete("/uploads/{upload_id}", status_code=204)
async def delete_upload(upload_id: str, service: TaskServiceDep) -> Response:
    task, record = await service.get_owned_file(upload_id)
    await service.remove_upload(task, record)
    return Response(status_code=204)


@router.post("/tasks/{task_id}/start", response_model=TaskResponse, status_code=202)
async def start_task(task_id: str, body: StartTaskRequest, service: TaskServiceDep) -> TaskResponse:
    task = await service.get_owned(task_id)
    task = await service.start(task, body.options, body.file_order, body.passwords)
    return service.to_response(task)


@router.post("/tasks/{task_id}/cancel", response_model=TaskResponse)
async def cancel_task(task_id: str, service: TaskServiceDep) -> TaskResponse:
    task = await service.get_owned(task_id)
    return service.to_response(await service.cancel(task))


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: str, service: TaskServiceDep) -> Response:
    task = await service.get_owned(task_id)
    await service.delete(task)
    return Response(status_code=204)


def _event(task: Task) -> TaskEvent:
    return TaskEvent(
        status=task.status,
        progress=task.progress,
        label=task.progress_label,
        error_code=task.error_code,
        error_message=task.error_message,
    )


@router.get("/tasks/{task_id}/events")
async def task_events(
    task_id: str, request: Request, service: TaskServiceDep, container: ContainerDep
) -> StreamingResponse:
    task = await service.get_owned(task_id)
    owner_key = task.owner_key

    async def stream() -> AsyncIterator[str]:
        last_payload = ""
        since_heartbeat = 0.0
        while True:
            if await request.is_disconnected():
                return
            async with container.database.session() as session:
                current = await session.get(Task, task_id)
                if current is None or current.owner_key != owner_key:
                    yield "event: gone\ndata: {}\n\n"
                    return
                payload = _event(current).model_dump_json()
                terminal = TaskStatus(current.status).is_terminal
            if payload != last_payload:
                last_payload = payload
                since_heartbeat = 0.0
                yield f"event: progress\ndata: {payload}\n\n"
            if terminal:
                yield f"event: done\ndata: {json.dumps({'status': json.loads(payload)['status']})}\n\n"
                return
            await asyncio.sleep(SSE_POLL_SECONDS)
            since_heartbeat += SSE_POLL_SECONDS
            if since_heartbeat >= SSE_HEARTBEAT_SECONDS:
                since_heartbeat = 0.0
                yield ": heartbeat\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
