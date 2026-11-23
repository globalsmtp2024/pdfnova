import secrets
import time
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import ContainerDep, CurrentUser, SessionDep, limit_by_ip
from app.api.routes.library import scope_for
from app.cloud import CloudError, CloudProvider, configured_providers
from app.core.crypto import load_key, open_text, seal_text
from app.core.errors import AppError, NotFoundError, ToolInputError
from app.core.security import sign_value, verify_signed_value
from app.db.base import utcnow
from app.fair_use import get_fair_use
from app.models.cloud import CloudConnection
from app.models.user import User
from app.services import library as library_service
from app.services.flags import require_flag
from app.services.permissions import Permission

router = APIRouter(prefix="/api/v1/cloud", tags=["cloud"])

STATE_MAX_AGE_SECONDS = 600
REFRESH_MARGIN_SECONDS = 60


class ProviderOut(BaseModel):
    name: str
    label: str
    connected: bool
    account: str


class EntryOut(BaseModel):
    id: str
    name: str
    is_folder: bool
    size: int | None
    mime_type: str | None
    modified: str | None


class ExportRequest(BaseModel):
    library_file_id: str | None = Field(default=None, max_length=64)
    task_id: str | None = Field(default=None, max_length=64)
    output_file_id: str | None = Field(default=None, max_length=64)
    folder_id: str | None = Field(default=None, max_length=1000)
    team_id: str | None = None


class ImportToLibrary(BaseModel):
    file_id: str = Field(min_length=1, max_length=1000)
    folder_id: str | None = None
    team_id: str | None = None


def provider_or_404(container: ContainerDep, name: str) -> CloudProvider:
    provider = configured_providers(container.settings).get(name)
    if provider is None:
        raise NotFoundError("That cloud service is not available on this server.")
    return provider


def redirect_uri(container: ContainerDep, name: str) -> str:
    return f"{container.settings.public_api_url.rstrip('/')}/api/v1/cloud/{name}/callback"


def make_state(name: str, user_id: str) -> str:
    stamp = int(time.time())
    nonce = secrets.token_urlsafe(8)
    payload = f"{name}.{user_id}.{stamp}.{nonce}"
    return f"{payload}.{sign_value('cloud:' + payload)}"


def read_state(name: str, state: str) -> str:
    payload, _, signature = state.rpartition(".")
    parts = payload.split(".")
    if len(parts) != 4 or parts[0] != name or not verify_signed_value("cloud:" + payload, signature):
        raise ToolInputError("This connection attempt is not valid.")
    if int(parts[2]) + STATE_MAX_AGE_SECONDS < time.time():
        raise ToolInputError("This connection attempt expired. Start again.")
    return parts[1]


async def connection_for(session: SessionDep, user: User, name: str) -> CloudConnection:
    found = await session.scalar(
        select(CloudConnection).where(CloudConnection.user_id == user.id, CloudConnection.provider == name)
    )
    if found is None:
        raise AppError("Connect this cloud service first.", hint="Use the Connect button in your dashboard.")
    return found


async def access_token(
    container: ContainerDep, session: SessionDep, provider: CloudProvider, record: CloudConnection
) -> str:
    key = load_key(container.settings.storage_encryption_key.get_secret_value())
    stale = record.expires_at is not None and record.expires_at <= utcnow() + timedelta(
        seconds=REFRESH_MARGIN_SECONDS
    )
    if stale and record.refresh_token_sealed:
        try:
            refreshed = await provider.refresh(open_text(key, record.refresh_token_sealed))
        except CloudError as exc:
            raise AppError(exc.message, hint="Connect the service again.") from exc
        record.access_token_sealed = seal_text(key, refreshed.access_token)
        if refreshed.refresh_token:
            record.refresh_token_sealed = seal_text(key, refreshed.refresh_token)
        record.expires_at = refreshed.expires_at
        await session.commit()
    return open_text(key, record.access_token_sealed)


def cloud_failure(error: CloudError) -> AppError:
    return AppError(error.message, hint="Connect the service again." if error.reauthorize else None)


@router.get("/providers", response_model=list[ProviderOut])
async def list_providers(
    container: ContainerDep, session: SessionDep, user: CurrentUser
) -> list[ProviderOut]:
    connected = {
        row.provider: row.account_label
        for row in await session.scalars(select(CloudConnection).where(CloudConnection.user_id == user.id))
    }
    return [
        ProviderOut(
            name=name, label=provider.label, connected=name in connected, account=connected.get(name, "")
        )
        for name, provider in configured_providers(container.settings).items()
    ]


@router.get("/{name}/connect")
async def connect(
    name: str, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> dict[str, str]:
    await require_flag(session, "cloud")
    provider = provider_or_404(container, name)
    return {"url": provider.authorize_url(make_state(name, user.id), redirect_uri(container, name))}


@router.get("/{name}/callback")
async def callback(
    name: str,
    request: Request,
    container: ContainerDep,
    session: SessionDep,
    code: str = "",
    state: str = "",
    error: str = "",
) -> Response:
    await limit_by_ip(request, container, "cloud-callback", limit=30, window=600)
    provider = provider_or_404(container, name)
    destination = f"{container.settings.public_web_url.rstrip('/')}/en/dashboard/files"
    if error or not code:
        return RedirectResponse(f"{destination}?cloud=denied", status_code=303)
    user_id = read_state(name, state)
    try:
        tokens = await provider.exchange_code(code, redirect_uri(container, name))
    except CloudError:
        return RedirectResponse(f"{destination}?cloud=failed", status_code=303)
    key = load_key(container.settings.storage_encryption_key.get_secret_value())
    record = await session.scalar(
        select(CloudConnection).where(CloudConnection.user_id == user_id, CloudConnection.provider == name)
    )
    if record is None:
        record = CloudConnection(user_id=user_id, provider=name, access_token_sealed="")
        session.add(record)
    record.account_label = tokens.account_label[:320]
    record.access_token_sealed = seal_text(key, tokens.access_token)
    record.refresh_token_sealed = seal_text(key, tokens.refresh_token) if tokens.refresh_token else None
    record.expires_at = tokens.expires_at
    await session.commit()
    return RedirectResponse(f"{destination}?{urlencode({'cloud': name})}", status_code=303)


@router.delete("/{name}", status_code=204)
async def disconnect(name: str, session: SessionDep, user: CurrentUser) -> Response:
    record = await session.scalar(
        select(CloudConnection).where(CloudConnection.user_id == user.id, CloudConnection.provider == name)
    )
    if record is not None:
        await session.delete(record)
        await session.commit()
    return Response(status_code=204)


@router.get("/{name}/files", response_model=list[EntryOut])
async def browse(
    name: str,
    container: ContainerDep,
    session: SessionDep,
    user: CurrentUser,
    folder: str | None = None,
    q: str = "",
) -> list[EntryOut]:
    provider = provider_or_404(container, name)
    record = await connection_for(session, user, name)
    token = await access_token(container, session, provider, record)
    try:
        entries = await provider.list_files(token, folder or None, q.strip()[:100])
    except CloudError as exc:
        raise cloud_failure(exc) from exc
    return [
        EntryOut(
            id=entry.id,
            name=entry.name,
            is_folder=entry.is_folder,
            size=entry.size,
            mime_type=entry.mime_type,
            modified=entry.modified,
        )
        for entry in entries
    ]


@router.post("/{name}/import", status_code=201)
async def import_to_library(
    name: str, body: ImportToLibrary, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> dict[str, Any]:
    provider = provider_or_404(container, name)
    record = await connection_for(session, user, name)
    token = await access_token(container, session, provider, record)
    try:
        downloaded = await provider.download(token, body.file_id, get_fair_use().max_file_bytes)
    except CloudError as exc:
        raise cloud_failure(exc) from exc
    scope = await scope_for(session, user, body.team_id, Permission.FILES_WRITE)
    saved = await library_service.save_bytes(
        container,
        session,
        scope,
        downloaded.filename,
        downloaded.data,
        downloaded.mime_type,
        body.folder_id,
        f"cloud:{name}",
    )
    return {"id": saved.id, "name": saved.name}


@router.post("/{name}/export")
async def export_file(
    name: str,
    body: ExportRequest,
    request: Request,
    container: ContainerDep,
    session: SessionDep,
    user: CurrentUser,
) -> dict[str, str]:
    await limit_by_ip(request, container, "cloud-export", limit=60, window=3600)
    provider = provider_or_404(container, name)
    record = await connection_for(session, user, name)
    if body.library_file_id:
        scope = await scope_for(session, user, body.team_id, Permission.FILES_READ)
        item = await library_service.get_file(session, scope, body.library_file_id)
        data = b"".join(container.storage.iter_bytes(item.storage_key))
        filename, mime = item.name, item.mime_type
    elif body.task_id and body.output_file_id:
        from app.models.task import FileRole, Task, TaskFile

        row = await session.execute(
            select(TaskFile, Task)
            .join(Task, Task.id == TaskFile.task_id)
            .where(
                TaskFile.id == body.output_file_id,
                Task.id == body.task_id,
                TaskFile.role == FileRole.OUTPUT.value,
            )
        )
        found = row.first()
        if found is None or found[1].owner_key != f"u:{user.id}":
            raise NotFoundError("That result was not found.")
        data = b"".join(container.storage.iter_bytes(found[0].storage_key))
        filename, mime = found[0].original_name, found[0].mime_type
    else:
        raise ToolInputError("Choose a file to send.")
    token = await access_token(container, session, provider, record)
    try:
        created = await provider.upload(token, body.folder_id, filename, data, mime)
    except CloudError as exc:
        raise cloud_failure(exc) from exc
    return {"id": created.id, "name": created.name}
