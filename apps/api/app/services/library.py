import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.errors import ConflictError, NotFoundError, QuotaExceededError, ToolInputError
from app.db.base import utcnow
from app.fair_use import get_fair_use
from app.models.library import LibraryFile, LibraryFolder
from app.models.task import FileRole, Task, TaskFile
from app.services.principal import Principal
from app.tools.base import safe_filename

MAX_TAGS = 12
MAX_TAG_LENGTH = 32
MAX_FOLDER_DEPTH = 8
MAX_FOLDERS_PER_USER = 500
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
TAG_PATTERN = re.compile(r"[^\w\- ]", re.UNICODE)


@dataclass(frozen=True)
class Scope:
    user_id: str
    team_id: str | None = None

    def key(self, file_id: str) -> str:
        if self.team_id:
            return f"library/team/{self.team_id}/{file_id}"
        return f"library/{self.user_id}/{file_id}"

    def folder_filter(self) -> ColumnElement[bool]:
        if self.team_id:
            return LibraryFolder.team_id == self.team_id
        return and_(LibraryFolder.user_id == self.user_id, LibraryFolder.team_id.is_(None))

    def file_filter(self) -> ColumnElement[bool]:
        if self.team_id:
            return LibraryFile.team_id == self.team_id
        return and_(LibraryFile.user_id == self.user_id, LibraryFile.team_id.is_(None))


def clean_tags(tags: list[str]) -> list[str]:
    cleaned: list[str] = []
    for tag in tags:
        value = TAG_PATTERN.sub("", tag).strip().lower()[:MAX_TAG_LENGTH]
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned[:MAX_TAGS]


def clean_name(name: str, fallback: str = "file") -> str:
    return safe_filename(name.strip(), fallback)[:255]


async def used_bytes(session: AsyncSession, scope: Scope) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(LibraryFile.size_bytes), 0)).where(scope.file_filter())
    )
    return int(total or 0)


async def ensure_room(session: AsyncSession, scope: Scope, extra: int) -> None:
    limit = get_fair_use().library_bytes
    if await used_bytes(session, scope) + extra > limit:
        raise QuotaExceededError(
            "Your My files storage is full.",
            hint="Delete files, empty the trash or download and remove older ones.",
        )


async def get_folder(session: AsyncSession, scope: Scope, folder_id: str) -> LibraryFolder:
    folder = await session.scalar(
        select(LibraryFolder).where(LibraryFolder.id == folder_id, scope.folder_filter())
    )
    if folder is None:
        raise NotFoundError("That folder was not found.")
    return folder


async def folder_depth(session: AsyncSession, folder: LibraryFolder) -> int:
    depth = 1
    current = folder
    while current.parent_id is not None and depth <= MAX_FOLDER_DEPTH + 1:
        parent = await session.get(LibraryFolder, current.parent_id)
        if parent is None:
            break
        current = parent
        depth += 1
    return depth


async def create_folder(
    session: AsyncSession, scope: Scope, name: str, parent_id: str | None
) -> LibraryFolder:
    cleaned = name.strip()
    if not cleaned or len(cleaned) > 120 or "/" in cleaned:
        raise ToolInputError("Folder names must be 1 to 120 characters and cannot contain a slash.")
    count = await session.scalar(select(func.count()).select_from(LibraryFolder).where(scope.folder_filter()))
    if (count or 0) >= MAX_FOLDERS_PER_USER:
        raise QuotaExceededError("You have reached the folder limit.")
    if parent_id is not None:
        parent = await get_folder(session, scope, parent_id)
        if await folder_depth(session, parent) >= MAX_FOLDER_DEPTH:
            raise ToolInputError("Folders can be nested up to eight levels.")
    folder = LibraryFolder(user_id=scope.user_id, team_id=scope.team_id, parent_id=parent_id, name=cleaned)
    session.add(folder)
    await session.commit()
    return folder


async def descendants(session: AsyncSession, scope: Scope, folder_id: str) -> list[str]:
    found = [folder_id]
    frontier = [folder_id]
    while frontier:
        rows = await session.scalars(
            select(LibraryFolder.id).where(scope.folder_filter(), LibraryFolder.parent_id.in_(frontier))
        )
        frontier = [row for row in rows if row not in found]
        found.extend(frontier)
    return found


async def delete_folder(session: AsyncSession, scope: Scope, folder_id: str) -> int:
    await get_folder(session, scope, folder_id)
    ids = await descendants(session, scope, folder_id)
    files = await session.scalars(
        select(LibraryFile).where(scope.file_filter(), LibraryFile.folder_id.in_(ids))
    )
    trashed = 0
    now = utcnow()
    for item in files:
        if item.deleted_at is None:
            item.deleted_at = now
            trashed += 1
        item.folder_id = None
    folders = await session.scalars(select(LibraryFolder).where(LibraryFolder.id.in_(ids)))
    for folder in folders:
        await session.delete(folder)
    await session.commit()
    return trashed


async def move_folder(
    session: AsyncSession, scope: Scope, folder_id: str, parent_id: str | None
) -> LibraryFolder:
    folder = await get_folder(session, scope, folder_id)
    if parent_id is not None:
        if parent_id in await descendants(session, scope, folder_id):
            raise ToolInputError("A folder cannot be moved into itself.")
        await get_folder(session, scope, parent_id)
    folder.parent_id = parent_id
    await session.commit()
    return folder


async def save_bytes(
    container: Container,
    session: AsyncSession,
    scope: Scope,
    name: str,
    data: bytes,
    mime_type: str,
    folder_id: str | None,
    source_tool: str | None,
    page_count: int | None = None,
) -> LibraryFile:
    if folder_id is not None:
        await get_folder(session, scope, folder_id)
    await ensure_room(session, scope, len(data))
    file_id = uuid.uuid4().hex
    key = scope.key(file_id)
    container.storage.put_bytes(key, data)
    record = LibraryFile(
        id=file_id,
        user_id=scope.user_id,
        team_id=scope.team_id,
        folder_id=folder_id,
        name=clean_name(name),
        mime_type=mime_type,
        size_bytes=len(data),
        storage_key=key,
        sha256=hashlib.sha256(data).hexdigest(),
        page_count=page_count,
        source_tool=source_tool,
        tags=[],
    )
    session.add(record)
    await session.commit()
    return record


async def save_task_output(
    container: Container,
    session: AsyncSession,
    principal: Principal,
    task_id: str,
    output_file_id: str,
    folder_id: str | None,
    name: str | None,
    scope: Scope,
) -> LibraryFile:
    user = principal.user
    if user is None:
        raise ToolInputError("Sign in to save files to My files.")
    row = await session.execute(
        select(TaskFile, Task)
        .join(Task, Task.id == TaskFile.task_id)
        .where(TaskFile.id == output_file_id, Task.id == task_id, TaskFile.role == FileRole.OUTPUT.value)
    )
    found = row.first()
    if found is None or found[1].owner_key != principal.owner_key:
        raise NotFoundError("That result was not found.")
    task_file, task = found
    if task.files_deleted_at is not None:
        raise ConflictError("That result has already been deleted.")
    data = b"".join(container.storage.iter_bytes(task_file.storage_key))
    return await save_bytes(
        container,
        session,
        scope,
        name or task_file.original_name,
        data,
        task_file.mime_type,
        folder_id,
        task.tool_slug,
        task_file.page_count,
    )


async def get_file(session: AsyncSession, scope: Scope, file_id: str) -> LibraryFile:
    record = await session.scalar(select(LibraryFile).where(LibraryFile.id == file_id, scope.file_filter()))
    if record is None:
        raise NotFoundError("That file was not found.")
    return record


async def search_files(
    session: AsyncSession,
    scope: Scope,
    folder_id: str | None,
    query: str,
    tag: str,
    trash: bool,
    everywhere: bool,
) -> list[LibraryFile]:
    statement = select(LibraryFile).where(scope.file_filter())
    statement = statement.where(
        LibraryFile.deleted_at.is_not(None) if trash else LibraryFile.deleted_at.is_(None)
    )
    if not trash and not everywhere and not query and not tag:
        statement = statement.where(
            LibraryFile.folder_id == folder_id if folder_id else LibraryFile.folder_id.is_(None)
        )
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        statement = statement.where(or_(LibraryFile.name.ilike(f"%{escaped}%", escape="\\")))
    rows = list(await session.scalars(statement.order_by(LibraryFile.updated_at.desc()).limit(500)))
    if tag:
        rows = [row for row in rows if tag in (row.tags or [])]
    return rows


async def purge_file(container: Container, session: AsyncSession, record: LibraryFile) -> None:
    container.storage.delete(record.storage_key)
    await session.delete(record)


async def purge_expired_trash(container: Container, session: AsyncSession) -> int:
    cutoff = utcnow() - timedelta(days=get_fair_use().library_trash_days)
    rows = list(
        await session.scalars(
            select(LibraryFile).where(LibraryFile.deleted_at.is_not(None), LibraryFile.deleted_at < cutoff)
        )
    )
    for record in rows:
        await purge_file(container, session, record)
    await session.commit()
    return len(rows)
