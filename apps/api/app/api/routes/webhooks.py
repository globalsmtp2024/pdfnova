import secrets

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import ContainerDep, CurrentUser, SessionDep
from app.core.crypto import load_key, seal_text
from app.core.errors import ConflictError, NotFoundError, ToolInputError
from app.db.base import utcnow
from app.models.webhook import Webhook, WebhookDelivery
from app.services import webhooks as service
from app.services.flags import require_flag

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

MAX_WEBHOOKS = 10
SECRET_PREFIX = "whsec_"


class WebhookCreate(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    events: list[str] = Field(min_length=1, max_length=len(service.EVENTS))
    description: str = Field(default="", max_length=200)


class WebhookUpdate(BaseModel):
    url: str | None = Field(default=None, min_length=8, max_length=2000)
    events: list[str] | None = Field(default=None, min_length=1, max_length=len(service.EVENTS))
    description: str | None = Field(default=None, max_length=200)
    active: bool | None = None


class WebhookOut(BaseModel):
    id: str
    url: str
    events: list[str]
    description: str
    active: bool
    secret_last4: str
    created_at: str


class WebhookCreated(WebhookOut):
    secret: str


class DeliveryOut(BaseModel):
    id: str
    event: str
    status: str
    attempts: int
    last_status_code: int | None
    last_error: str | None
    created_at: str
    delivered_at: str | None
    next_attempt_at: str | None


def hook_out(hook: Webhook) -> WebhookOut:
    return WebhookOut(
        id=hook.id,
        url=hook.url,
        events=list(hook.events or []),
        description=hook.description,
        active=hook.active,
        secret_last4=hook.secret_last4,
        created_at=hook.created_at.isoformat(),
    )


def delivery_out(delivery: WebhookDelivery) -> DeliveryOut:
    return DeliveryOut(
        id=delivery.id,
        event=delivery.event,
        status=delivery.status,
        attempts=delivery.attempts,
        last_status_code=delivery.last_status_code,
        last_error=delivery.last_error,
        created_at=delivery.created_at.isoformat(),
        delivered_at=delivery.delivered_at.isoformat() if delivery.delivered_at else None,
        next_attempt_at=delivery.next_attempt_at.isoformat() if delivery.next_attempt_at else None,
    )


def check_events(events: list[str]) -> list[str]:
    unknown = [event for event in events if event not in service.EVENTS or event == "test.ping"]
    if unknown:
        raise ToolInputError(
            f"Unknown event: {unknown[0]}.", hint=f"Choose from: {', '.join(service.EVENTS[:-1])}."
        )
    return sorted(set(events))


async def owned(session: SessionDep, user_id: str, webhook_id: str) -> Webhook:
    hook = await session.get(Webhook, webhook_id)
    if hook is None or hook.user_id != user_id:
        raise NotFoundError("That webhook was not found.")
    return hook


@router.get("/events")
async def list_events() -> dict[str, list[str]]:
    return {"events": [event for event in service.EVENTS if event != "test.ping"]}


@router.get("", response_model=list[WebhookOut])
async def list_webhooks(session: SessionDep, user: CurrentUser) -> list[WebhookOut]:
    rows = await session.scalars(
        select(Webhook).where(Webhook.user_id == user.id).order_by(Webhook.created_at)
    )
    return [hook_out(row) for row in rows]


@router.post("", response_model=WebhookCreated, status_code=201)
async def create_webhook(
    body: WebhookCreate, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> WebhookCreated:
    await require_flag(session, "webhooks")
    existing = list(await session.scalars(select(Webhook).where(Webhook.user_id == user.id)))
    if len(existing) >= MAX_WEBHOOKS:
        raise ConflictError(f"You can have up to {MAX_WEBHOOKS} webhooks.")
    url = service.validate_url(body.url, container.settings.webhook_allow_private)
    secret = SECRET_PREFIX + secrets.token_urlsafe(32)
    key = load_key(container.settings.storage_encryption_key.get_secret_value())
    hook = Webhook(
        user_id=user.id,
        url=url,
        secret_sealed=seal_text(key, secret),
        secret_last4=secret[-4:],
        events=check_events(body.events),
        description=body.description.strip(),
    )
    session.add(hook)
    await session.commit()
    return WebhookCreated(**hook_out(hook).model_dump(), secret=secret)


@router.patch("/{webhook_id}", response_model=WebhookOut)
async def update_webhook(
    webhook_id: str, body: WebhookUpdate, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> WebhookOut:
    hook = await owned(session, user.id, webhook_id)
    if body.url is not None:
        hook.url = service.validate_url(body.url, container.settings.webhook_allow_private)
    if body.events is not None:
        hook.events = check_events(body.events)
    if body.description is not None:
        hook.description = body.description.strip()
    if body.active is not None:
        hook.active = body.active
    await session.commit()
    return hook_out(hook)


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(webhook_id: str, session: SessionDep, user: CurrentUser) -> Response:
    hook = await owned(session, user.id, webhook_id)
    await session.delete(hook)
    await session.commit()
    return Response(status_code=204)


@router.post("/{webhook_id}/test", response_model=DeliveryOut, status_code=202)
async def send_test(webhook_id: str, session: SessionDep, user: CurrentUser) -> DeliveryOut:
    hook = await owned(session, user.id, webhook_id)
    delivery_id = secrets.token_hex(16)
    delivery = WebhookDelivery(
        id=delivery_id,
        webhook_id=hook.id,
        event="test.ping",
        payload={
            "id": delivery_id,
            "type": "test.ping",
            "created_at": utcnow().isoformat(),
            "data": {"message": "This is a test delivery."},
        },
        status="pending",
        next_attempt_at=utcnow(),
    )
    session.add(delivery)
    await session.commit()
    return delivery_out(delivery)


@router.get("/{webhook_id}/deliveries", response_model=list[DeliveryOut])
async def list_deliveries(webhook_id: str, session: SessionDep, user: CurrentUser) -> list[DeliveryOut]:
    await owned(session, user.id, webhook_id)
    rows = await session.scalars(
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == webhook_id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(100)
    )
    return [delivery_out(row) for row in rows]


@router.post("/{webhook_id}/deliveries/{delivery_id}/retry", response_model=DeliveryOut)
async def retry_delivery(
    webhook_id: str, delivery_id: str, session: SessionDep, user: CurrentUser
) -> DeliveryOut:
    await owned(session, user.id, webhook_id)
    delivery = await session.get(WebhookDelivery, delivery_id)
    if delivery is None or delivery.webhook_id != webhook_id:
        raise NotFoundError("That delivery was not found.")
    delivery.status = "pending"
    delivery.attempts = 0
    delivery.next_attempt_at = utcnow()
    await session.commit()
    return delivery_out(delivery)
