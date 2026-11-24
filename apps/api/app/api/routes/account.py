import json
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from app.api.deps import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    ContainerDep,
    CurrentUser,
    SessionDep,
    SettingsDep,
    limit_by_ip,
)
from app.schemas.auth import MessageResponse, UserResponse
from app.services.account import AI_PROVIDERS, AccountService

router = APIRouter(prefix="/api/v1/me", tags=["account"])

SUPPORTED_LOCALES = ("en", "ur")


def get_account_service(session: SessionDep, container: ContainerDep) -> AccountService:
    return AccountService(session, container)


AccountDep = Annotated[AccountService, Depends(get_account_service)]


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    locale: str | None = Field(default=None, max_length=16)
    retention_extended: bool | None = None


class AiKeyTest(BaseModel):
    provider: str | None = Field(default=None, max_length=32)
    api_key: str | None = Field(default=None, max_length=400)
    base_url: str | None = Field(default=None, max_length=300)
    model: str | None = Field(default=None, max_length=120)


class AiKeyTestResult(BaseModel):
    ok: bool
    message: str


class AiKeyRequest(BaseModel):
    provider: str = Field(default="anthropic", max_length=32)
    api_key: str = Field(default="", max_length=400)
    base_url: str | None = Field(default=None, max_length=300)
    model: str | None = Field(default=None, max_length=120)


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: list[str] | None = Field(default=None, max_length=20)


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    prefix: str
    scopes: list[str] | None = None
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class ApiKeyCreated(ApiKeyResponse):
    secret: str


class HistoryItem(BaseModel):
    id: str
    tool: str
    status: str
    created_at: datetime
    finished_at: datetime | None
    expires_at: datetime
    files_deleted: bool
    file_names: list[str]
    output_bytes: int


class DeleteAccountRequest(BaseModel):
    password: str = Field(default="", max_length=256)
    confirm_email: str = Field(default="", max_length=320)


@router.patch("", response_model=UserResponse)
async def update_profile(body: ProfileUpdate, user: CurrentUser, session: SessionDep) -> UserResponse:
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    if body.locale is not None:
        user.locale = body.locale if body.locale in SUPPORTED_LOCALES else "en"
    if body.retention_extended is not None:
        user.retention_extended = body.retention_extended
    await session.commit()
    return UserResponse.from_user(user)


@router.get("/ai-providers")
async def ai_providers() -> dict[str, list[str]]:
    return {"providers": list(AI_PROVIDERS)}


@router.put("/ai-key", response_model=UserResponse)
async def set_ai_key(
    body: AiKeyRequest, user: CurrentUser, service: AccountDep, session: SessionDep
) -> UserResponse:
    await service.set_ai_key(user, body.provider, body.api_key, body.base_url, body.model)
    await session.commit()
    return UserResponse.from_user(user)


@router.post("/ai-key/test", response_model=AiKeyTestResult)
async def test_ai_key(
    body: AiKeyTest, request: Request, user: CurrentUser, service: AccountDep, container: ContainerDep
) -> AiKeyTestResult:
    await limit_by_ip(request, container, "ai-key-test", limit=10, window=60)
    ok, message = await service.test_ai_key(
        user, body.provider, body.api_key, body.base_url, body.model
    )
    return AiKeyTestResult(ok=ok, message=message)


@router.delete("/ai-key", response_model=UserResponse)
async def clear_ai_key(user: CurrentUser, service: AccountDep, session: SessionDep) -> UserResponse:
    service.clear_ai_key(user)
    await session.commit()
    return UserResponse.from_user(user)


def _key_response(record: Any) -> ApiKeyResponse:
    return ApiKeyResponse(
        id=record.id,
        name=record.name,
        prefix=record.prefix,
        scopes=record.scopes,
        created_at=record.created_at,
        last_used_at=record.last_used_at,
        revoked_at=record.revoked_at,
    )


@router.get("/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(user: CurrentUser, service: AccountDep) -> list[ApiKeyResponse]:
    return [_key_response(record) for record in await service.list_api_keys(user)]


@router.post("/api-keys", response_model=ApiKeyCreated, status_code=201)
async def create_api_key(
    body: ApiKeyCreate, user: CurrentUser, service: AccountDep, session: SessionDep
) -> ApiKeyCreated:
    record, raw = await service.create_api_key(user, body.name, body.scopes)
    await session.commit()
    return ApiKeyCreated(**_key_response(record).model_dump(), secret=raw)


@router.delete("/api-keys/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: str, user: CurrentUser, service: AccountDep, session: SessionDep
) -> Response:
    await service.revoke_api_key(user, key_id)
    await session.commit()
    return Response(status_code=204)


@router.get("/api-usage")
async def api_usage(user: CurrentUser, service: AccountDep) -> dict[str, Any]:
    return await service.api_usage(user)


@router.get("/history", response_model=list[HistoryItem])
async def history(user: CurrentUser, service: AccountDep) -> list[HistoryItem]:
    return [
        HistoryItem(
            id=task.id,
            tool=task.tool_slug,
            status=task.status,
            created_at=task.created_at,
            finished_at=task.finished_at,
            expires_at=task.expires_at,
            files_deleted=task.files_deleted_at is not None,
            file_names=[file.original_name for file in task.files if file.role == "input"],
            output_bytes=task.output_bytes,
        )
        for task in await service.recent_tasks(user)
    ]


@router.get("/export")
async def export_data(user: CurrentUser, service: AccountDep) -> Response:
    payload = await service.export(user)
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="my-data.json"', "Cache-Control": "no-store"},
    )


@router.post("/delete", response_model=MessageResponse)
async def delete_account(
    body: DeleteAccountRequest,
    response: Response,
    user: CurrentUser,
    service: AccountDep,
    session: SessionDep,
    settings: SettingsDep,
) -> MessageResponse:
    await service.delete_account(user, body.password, body.confirm_email)
    await session.commit()
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=settings.cookie_domain)
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth", domain=settings.cookie_domain)
    return MessageResponse(message="Your account and all of its files were deleted.")
