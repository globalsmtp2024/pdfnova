from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import ContainerDep, CurrentUser, PrincipalDep, SessionDep
from app.core.errors import ToolInputError
from app.db.base import utcnow
from app.fair_use import get_fair_use
from app.models.library import LibraryFile, LibraryFolder
from app.services import library as service

router = APIRouter(prefix="/api/v1/library", tags=["library"])


class FolderOut(BaseModel):
    id: str
    name: str
    parent_id: str | None


class FileOut(BaseModel):
    id: str
    name: str
    folder_id: str | None
    mime_type: str
    size_bytes: int
    page_count: int | None
    source_tool: str | None
    tags: list[str]
    created_at: str
    updated_at: str
    deleted_at: str | None


class QuotaOut(BaseModel):
    used_bytes: int
    limit_bytes: int
    file_count: int
    trash_days: int


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: str | None = None


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    parent_id: str | None = None
    move: bool = False


class FileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    tags: list[str] | None = Field(default=None, max_length=service.MAX_TAGS * 2)
    folder_id: str | None = None
    move: bool = False


class FromTask(BaseModel):
    task_id: str = Field(min_length=1, max_length=64)
    output_file_id: str = Field(min_length=1, max_length=64)
    folder_id: str | None = None
    name: str | None = Field(default=None, max_length=255)


def file_out(record: LibraryFile) -> FileOut:
    return FileOut(
        id=record.id,
        name=record.name,
        folder_id=record.folder_id,
        mime_type=record.mime_type,
        size_bytes=record.size_bytes,
        page_count=record.page_count,
        source_tool=record.source_tool,
        tags=list(record.tags or []),
        created_at=record.created_at.isoformat(),
        updated_at=record.updated_at.isoformat(),
        deleted_at=record.deleted_at.isoformat() if record.deleted_at else None,
    )


def folder_out(folder: LibraryFolder) -> FolderOut:
    return FolderOut(id=folder.id, name=folder.name, parent_id=folder.parent_id)


@router.get("/quota", response_model=QuotaOut)
async def quota(session: SessionDep, user: CurrentUser) -> QuotaOut:
    from sqlalchemy import func

    count = await session.scalar(
        select(func.count()).select_from(LibraryFile).where(LibraryFile.user_id == user.id)
    )
    limits = get_fair_use()
    return QuotaOut(
        used_bytes=await service.used_bytes(session, user.id),
        limit_bytes=limits.library_bytes,
        file_count=int(count or 0),
        trash_days=limits.library_trash_days,
    )


@router.get("/folders", response_model=list[FolderOut])
async def list_folders(session: SessionDep, user: CurrentUser) -> list[FolderOut]:
    rows = await session.scalars(
        select(LibraryFolder).where(LibraryFolder.user_id == user.id).order_by(LibraryFolder.name)
    )
    return [folder_out(row) for row in rows]


@router.post("/folders", response_model=FolderOut, status_code=201)
async def create_folder(body: FolderCreate, session: SessionDep, user: CurrentUser) -> FolderOut:
    return folder_out(await service.create_folder(session, user.id, body.name, body.parent_id))


@router.patch("/folders/{folder_id}", response_model=FolderOut)
async def update_folder(
    folder_id: str, body: FolderUpdate, session: SessionDep, user: CurrentUser
) -> FolderOut:
    folder = await service.get_folder(session, user.id, folder_id)
    if body.name is not None:
        if "/" in body.name or not body.name.strip():
            raise ToolInputError("Folder names cannot contain a slash.")
        folder.name = body.name.strip()
        await session.commit()
    if body.move:
        folder = await service.move_folder(session, user.id, folder_id, body.parent_id)
    return folder_out(folder)


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, session: SessionDep, user: CurrentUser) -> dict[str, int]:
    return {"trashed_files": await service.delete_folder(session, user.id, folder_id)}


@router.get("/files", response_model=list[FileOut])
async def list_files(
    session: SessionDep,
    user: CurrentUser,
    folder_id: str | None = None,
    q: Annotated[str, Field(max_length=100)] = "",
    tag: Annotated[str, Field(max_length=40)] = "",
    trash: bool = False,
    everywhere: bool = False,
) -> list[FileOut]:
    rows = await service.search_files(
        session, user.id, folder_id, q.strip(), tag.strip().lower(), trash, everywhere
    )
    return [file_out(row) for row in rows]


@router.post("/files", response_model=FileOut, status_code=201)
async def upload_file(
    container: ContainerDep,
    session: SessionDep,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    folder_id: Annotated[str | None, Form()] = None,
) -> FileOut:
    data = await file.read(service.MAX_UPLOAD_BYTES + 1)
    if len(data) > service.MAX_UPLOAD_BYTES:
        raise ToolInputError("That file is larger than 100 MB.")
    if not data:
        raise ToolInputError("That file is empty.")
    record = await service.save_bytes(
        container,
        session,
        user.id,
        file.filename or "file",
        data,
        file.content_type or "application/octet-stream",
        folder_id or None,
        None,
    )
    return file_out(record)


@router.post("/files/from-task", response_model=FileOut, status_code=201)
async def save_from_task(
    body: FromTask, container: ContainerDep, session: SessionDep, principal: PrincipalDep
) -> FileOut:
    record = await service.save_task_output(
        container, session, principal, body.task_id, body.output_file_id, body.folder_id, body.name
    )
    return file_out(record)


@router.patch("/files/{file_id}", response_model=FileOut)
async def update_file(file_id: str, body: FileUpdate, session: SessionDep, user: CurrentUser) -> FileOut:
    record = await service.get_file(session, user.id, file_id)
    if body.name is not None:
        record.name = service.clean_name(body.name, record.name)
    if body.tags is not None:
        record.tags = service.clean_tags(body.tags)
    if body.move:
        if body.folder_id is not None:
            await service.get_folder(session, user.id, body.folder_id)
        record.folder_id = body.folder_id
    await session.commit()
    return file_out(record)


@router.get("/files/{file_id}/download")
async def download_file(
    file_id: str, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> Response:
    record = await service.get_file(session, user.id, file_id)
    safe = record.name.replace('"', "").replace("\r", "").replace("\n", "")
    return StreamingResponse(
        container.storage.iter_bytes(record.storage_key),
        media_type=record.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{safe}"', "Cache-Control": "no-store"},
    )


@router.delete("/files/{file_id}", response_model=FileOut)
async def trash_file(file_id: str, session: SessionDep, user: CurrentUser) -> FileOut:
    record = await service.get_file(session, user.id, file_id)
    record.deleted_at = record.deleted_at or utcnow()
    await session.commit()
    return file_out(record)


@router.post("/files/{file_id}/restore", response_model=FileOut)
async def restore_file(file_id: str, session: SessionDep, user: CurrentUser) -> FileOut:
    record = await service.get_file(session, user.id, file_id)
    record.deleted_at = None
    await session.commit()
    return file_out(record)


@router.delete("/files/{file_id}/permanent", status_code=204)
async def delete_permanently(
    file_id: str, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> Response:
    record = await service.get_file(session, user.id, file_id)
    await service.purge_file(container, session, record)
    await session.commit()
    return Response(status_code=204)


@router.delete("/trash")
async def empty_trash(container: ContainerDep, session: SessionDep, user: CurrentUser) -> dict[str, int]:
    rows = list(
        await session.scalars(
            select(LibraryFile).where(LibraryFile.user_id == user.id, LibraryFile.deleted_at.is_not(None))
        )
    )
    for record in rows:
        await service.purge_file(container, session, record)
    await session.commit()
    return {"deleted": len(rows)}
