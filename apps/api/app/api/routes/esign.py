import json
from collections.abc import Iterator
from typing import Annotated, Any, Literal

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.api.deps import ContainerDep, CurrentUser, SessionDep, client_ip_hash, limit_by_ip
from app.core.errors import ConflictError, NotFoundError, ToolInputError
from app.core.security import verify_signed_value
from app.db.base import utcnow
from app.models.esign import RecipientStatus, SignRequest, SignRequestStatus
from app.services import esign as service
from app.services.flags import require_flag

router = APIRouter(prefix="/api/v1/esign", tags=["esign"])

MAX_PDF_BYTES = 40 * 1024 * 1024
MAX_METADATA_BYTES = 200_000


class RecipientIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr


class FieldIn(BaseModel):
    recipient: int = Field(ge=0, le=service.MAX_RECIPIENTS)
    kind: Literal["signature", "initials", "date", "text", "checkbox"]
    page: int = Field(ge=1)
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    width: float = Field(ge=0.5, le=100)
    height: float = Field(ge=0.5, le=100)
    required: bool = True
    label: str = Field(default="", max_length=120)


class CreateRequestMetadata(BaseModel):
    title: str = Field(default="", max_length=200)
    message: str = Field(default="", max_length=2000)
    expires_days: int = Field(default=14, ge=1, le=60)
    recipients: list[RecipientIn] = Field(min_length=1, max_length=service.MAX_RECIPIENTS)
    fields: list[FieldIn] = Field(min_length=1, max_length=service.MAX_FIELDS)
    send: bool = True


class RecipientOut(BaseModel):
    id: str
    name: str
    email: str
    status: str
    viewed_at: str | None
    signed_at: str | None
    declined_at: str | None
    decline_reason: str | None


class EventOut(BaseModel):
    event: str
    at: str
    recipient_name: str | None
    detail: dict[str, Any]


class FieldOut(BaseModel):
    id: str
    recipient_id: str
    kind: str
    page: int
    x: float
    y: float
    width: float
    height: float
    required: bool
    label: str


class RequestSummary(BaseModel):
    id: str
    title: str
    status: str
    created_at: str
    expires_at: str
    sent_at: str | None
    completed_at: str | None
    page_count: int
    signed: int
    total: int


class RequestDetail(RequestSummary):
    message: str
    original_sha256: str
    signed_sha256: str | None
    recipients: list[RecipientOut]
    fields: list[FieldOut]
    events: list[EventOut]


class SignerView(BaseModel):
    title: str
    message: str
    sender: str
    signer_name: str
    expires_at: str
    page_count: int
    fields: list[FieldOut]


class SubmitBody(BaseModel):
    values: dict[str, str] = Field(default_factory=dict, max_length=service.MAX_FIELDS)
    consent: bool


class DeclineBody(BaseModel):
    reason: str = Field(default="", max_length=500)


def iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def summarize(request: SignRequest) -> RequestSummary:
    effective = request.status
    if effective == SignRequestStatus.SENT.value and request.expires_at <= utcnow():
        effective = SignRequestStatus.EXPIRED.value
    return RequestSummary(
        id=request.id,
        title=request.title,
        status=effective,
        created_at=request.created_at.isoformat(),
        expires_at=request.expires_at.isoformat(),
        sent_at=iso(request.sent_at),
        completed_at=iso(request.completed_at),
        page_count=request.page_count,
        signed=sum(r.status == RecipientStatus.SIGNED.value for r in request.recipients),
        total=len(request.recipients),
    )


def field_out(field: Any) -> FieldOut:
    return FieldOut(
        id=field.id,
        recipient_id=field.recipient_id,
        kind=field.kind,
        page=field.page,
        x=field.x,
        y=field.y,
        width=field.width,
        height=field.height,
        required=field.required,
        label=field.label,
    )


def detail(request: SignRequest) -> RequestDetail:
    names = {r.id: r.name for r in request.recipients}
    base = summarize(request)
    return RequestDetail(
        **base.model_dump(),
        message=request.message,
        original_sha256=request.original_sha256,
        signed_sha256=request.signed_sha256,
        recipients=[
            RecipientOut(
                id=r.id,
                name=r.name,
                email=r.email,
                status=r.status,
                viewed_at=iso(r.viewed_at),
                signed_at=iso(r.signed_at),
                declined_at=iso(r.declined_at),
                decline_reason=r.decline_reason,
            )
            for r in request.recipients
        ],
        fields=[field_out(f) for f in request.fields],
        events=[
            EventOut(
                event=e.event,
                at=e.created_at.isoformat(),
                recipient_name=names.get(e.recipient_id or ""),
                detail=e.detail,
            )
            for e in request.events
        ],
    )


async def owned(session: SessionDep, user_id: str, request_id: str) -> SignRequest:
    request = await session.get(SignRequest, request_id)
    if request is None or request.owner_id != user_id:
        raise NotFoundError("That signing request was not found.")
    return request


@router.post("/requests", response_model=RequestDetail, status_code=201)
async def create_request(
    container: ContainerDep,
    session: SessionDep,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    metadata: Annotated[str, Form(max_length=MAX_METADATA_BYTES)],
) -> RequestDetail:
    await require_flag(session, "esign")
    data = await file.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise ToolInputError("This PDF is larger than 40 MB.")
    if not data.startswith(b"%PDF"):
        raise ToolInputError("Upload a PDF file.")
    try:
        parsed = CreateRequestMetadata.model_validate(json.loads(metadata))
    except (ValueError, TypeError) as exc:
        raise ToolInputError("The signing request details are not valid.") from exc
    request = await service.create_request(
        container,
        session,
        user.id,
        file.filename or "document.pdf",
        data,
        parsed.title,
        parsed.message,
        parsed.expires_days,
        [r.model_dump() | {"email": str(r.email)} for r in parsed.recipients],
        [f.model_dump() for f in parsed.fields],
    )
    if parsed.send:
        await service.send_request(container, session, request, user.display_name or user.email)
        await session.refresh(request)
    return detail(request)


@router.get("/requests", response_model=list[RequestSummary])
async def list_requests(session: SessionDep, user: CurrentUser) -> list[RequestSummary]:
    rows = await session.scalars(
        select(SignRequest)
        .where(SignRequest.owner_id == user.id)
        .order_by(SignRequest.created_at.desc())
        .limit(200)
    )
    return [summarize(row) for row in rows]


@router.get("/requests/{request_id}", response_model=RequestDetail)
async def get_request(request_id: str, session: SessionDep, user: CurrentUser) -> RequestDetail:
    return detail(await owned(session, user.id, request_id))


@router.post("/requests/{request_id}/send", response_model=RequestDetail)
async def send_again(
    request_id: str, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> RequestDetail:
    request = await owned(session, user.id, request_id)
    await service.send_request(container, session, request, user.display_name or user.email)
    await session.refresh(request)
    return detail(request)


@router.post("/requests/{request_id}/cancel", response_model=RequestDetail)
async def cancel_request(request_id: str, session: SessionDep, user: CurrentUser) -> RequestDetail:
    request = await owned(session, user.id, request_id)
    if request.status in {SignRequestStatus.COMPLETED.value, SignRequestStatus.CANCELLED.value}:
        raise ConflictError("This request is already closed.")
    request.status = SignRequestStatus.CANCELLED.value
    for recipient in request.recipients:
        recipient.token_hash = None
    await service.record_event(session, request, "cancelled")
    await session.commit()
    return detail(request)


@router.get("/requests/{request_id}/document")
async def download_document(
    request_id: str,
    container: ContainerDep,
    session: SessionDep,
    user: CurrentUser,
    version: Literal["original", "signed"] = "signed",
) -> Response:
    request = await owned(session, user.id, request_id)
    key = request.signed_key if version == "signed" and request.signed_key else request.original_key
    return pdf_response(container, key, request.title)


def pdf_response(container: Any, key: str, title: str) -> Response:
    iterator: Iterator[bytes] = container.storage.iter_bytes(key)
    safe = "".join(ch for ch in title if ch.isalnum() or ch in " -_")[:80].strip() or "document"
    return StreamingResponse(
        iterator,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}.pdf"', "Cache-Control": "no-store"},
    )


@router.get("/completed/{request_id}/{signature}")
async def download_completed(
    request_id: str, signature: str, container: ContainerDep, session: SessionDep
) -> Response:
    if not verify_signed_value(f"esign-completed:{request_id}", signature):
        raise NotFoundError("This download link is not valid.")
    request = await session.get(SignRequest, request_id)
    if request is None or not request.signed_key:
        raise NotFoundError("This document is not available.")
    return pdf_response(container, request.signed_key, request.title)


@router.get("/sign/{token}", response_model=SignerView)
async def signer_view(
    token: str, request: Request, container: ContainerDep, session: SessionDep
) -> SignerView:
    await limit_by_ip(request, container, "esign-view", limit=60, window=60)
    sign_request, recipient = await service.find_recipient(session, token)
    service.ensure_open(sign_request, recipient)
    if recipient.viewed_at is None:
        recipient.viewed_at = utcnow()
        recipient.status = RecipientStatus.VIEWED.value
        await service.record_event(session, sign_request, "viewed", recipient.id, client_ip_hash(request))
        await session.commit()
    owner = await service.owner_of(session, sign_request)
    return SignerView(
        title=sign_request.title,
        message=sign_request.message,
        sender=(owner.display_name or owner.email) if owner else "",
        signer_name=recipient.name,
        expires_at=sign_request.expires_at.isoformat(),
        page_count=sign_request.page_count,
        fields=[field_out(f) for f in sign_request.fields if f.recipient_id == recipient.id],
    )


@router.get("/sign/{token}/document")
async def signer_document(
    token: str, request: Request, container: ContainerDep, session: SessionDep
) -> Response:
    await limit_by_ip(request, container, "esign-doc", limit=60, window=60)
    sign_request, recipient = await service.find_recipient(session, token)
    service.ensure_open(sign_request, recipient)
    iterator = container.storage.iter_bytes(sign_request.original_key)
    return StreamingResponse(iterator, media_type="application/pdf", headers={"Cache-Control": "no-store"})


@router.post("/sign/{token}/submit")
async def submit(
    token: str, body: SubmitBody, request: Request, container: ContainerDep, session: SessionDep
) -> dict[str, bool]:
    await limit_by_ip(request, container, "esign-submit", limit=20, window=60)
    if not body.consent:
        raise ToolInputError("Please agree to sign electronically.")
    sign_request, recipient = await service.find_recipient(session, token)
    finished = await service.submit_values(
        container, session, sign_request, recipient, body.values, client_ip_hash(request)
    )
    return {"completed": finished}


@router.post("/sign/{token}/decline")
async def decline(
    token: str, body: DeclineBody, request: Request, container: ContainerDep, session: SessionDep
) -> dict[str, bool]:
    await limit_by_ip(request, container, "esign-decline", limit=20, window=60)
    sign_request, recipient = await service.find_recipient(session, token)
    await service.decline(container, session, sign_request, recipient, body.reason, client_ip_hash(request))
    return {"declined": True}
