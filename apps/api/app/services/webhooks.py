import asyncio
import contextlib
import hashlib
import hmac
import json
import socket
import time
from datetime import timedelta
from typing import Any
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.crypto import load_key, open_text
from app.core.errors import ToolInputError
from app.core.logging import get_logger
from app.db.base import new_id, utcnow
from app.db.session import Database
from app.models.webhook import Webhook, WebhookDelivery
from app.services.url_import import is_public_address

log = get_logger(__name__)

EVENTS: tuple[str, ...] = (
    "task.succeeded",
    "task.failed",
    "esign.completed",
    "esign.declined",
    "test.ping",
)
RETRY_DELAYS = (30, 120, 600, 3600, 21600)
MAX_ATTEMPTS = len(RETRY_DELAYS) + 1
DELIVERY_TIMEOUT = 10.0
POLL_SECONDS = 5
BATCH = 25
USER_AGENT = "PDFNova-Webhooks/1"
ALLOWED_PORTS = frozenset({80, 443, 8080, 8443})


def sign(secret: str, timestamp: int, body: bytes) -> str:
    message = f"{timestamp}.".encode() + body
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def signature_header(secret: str, timestamp: int, body: bytes) -> str:
    return f"t={timestamp},v1={sign(secret, timestamp, body)}"


def validate_url(url: str, allow_private: bool) -> str:
    parts = urlsplit(url.strip())
    if parts.scheme not in {"https", "http"} or not parts.hostname:
        raise ToolInputError("Webhook addresses must start with https://")
    if parts.scheme == "http" and not allow_private:
        raise ToolInputError("Webhook addresses must use https.")
    if parts.username or parts.password:
        raise ToolInputError("Webhook addresses cannot contain a username or password.")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if not allow_private and port not in ALLOWED_PORTS:
        raise ToolInputError("That port is not allowed for webhooks.")
    return url.strip()


async def resolves_publicly(url: str) -> bool:
    parts = urlsplit(url)
    host = parts.hostname or ""
    port = parts.port or (443 if parts.scheme == "https" else 80)
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        return False
    addresses = {str(info[4][0]) for info in infos}
    return bool(addresses) and all(is_public_address(address) for address in addresses)


async def enqueue(session: AsyncSession, user_id: str | None, event: str, data: dict[str, Any]) -> int:
    if user_id is None:
        return 0
    hooks = list(
        await session.scalars(select(Webhook).where(Webhook.user_id == user_id, Webhook.active.is_(True)))
    )
    created = 0
    for hook in hooks:
        if event not in (hook.events or []):
            continue
        delivery_id = new_id()
        session.add(
            WebhookDelivery(
                id=delivery_id,
                webhook_id=hook.id,
                event=event,
                payload={
                    "id": delivery_id,
                    "type": event,
                    "created_at": utcnow().isoformat(),
                    "data": data,
                },
                status="pending",
                next_attempt_at=utcnow(),
            )
        )
        created += 1
    return created


class WebhookWorker:
    def __init__(self, settings: Settings, database: Database):
        self._settings = settings
        self._database = database
        self._task: asyncio.Task[None] | None = None
        self._stopping = asyncio.Event()

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._stopping.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _loop(self) -> None:
        while not self._stopping.is_set():
            try:
                await self.run_once()
            except Exception:
                log.exception("webhook_worker_error")
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._stopping.wait(), POLL_SECONDS)

    async def run_once(self) -> int:
        async with self._database.session() as session:
            due = list(
                await session.scalars(
                    select(WebhookDelivery)
                    .where(WebhookDelivery.status == "pending", WebhookDelivery.next_attempt_at <= utcnow())
                    .order_by(WebhookDelivery.next_attempt_at)
                    .limit(BATCH)
                )
            )
            for delivery in due:
                hook = await session.get(Webhook, delivery.webhook_id)
                if hook is None or not hook.active:
                    delivery.status = "failed"
                    delivery.last_error = "The webhook was removed or disabled."
                    continue
                await self._attempt(delivery, hook)
            await session.commit()
            return len(due)

    async def _attempt(self, delivery: WebhookDelivery, hook: Webhook) -> None:
        key = load_key(self._settings.storage_encryption_key.get_secret_value())
        secret = open_text(key, hook.secret_sealed)
        body = json.dumps(delivery.payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        timestamp = int(time.time())
        delivery.attempts += 1
        status_code: int | None = None
        error: str | None = None
        try:
            validate_url(hook.url, self._settings.webhook_allow_private)
            if not self._settings.webhook_allow_private and not await resolves_publicly(hook.url):
                raise ToolInputError("The webhook address does not resolve to a public server.")
            async with httpx.AsyncClient(timeout=DELIVERY_TIMEOUT, follow_redirects=False) as client:
                response = await client.post(
                    hook.url,
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": USER_AGENT,
                        "X-PDFNova-Event": delivery.event,
                        "X-PDFNova-Delivery": delivery.id,
                        "X-PDFNova-Signature": signature_header(secret, timestamp, body),
                    },
                )
            status_code = response.status_code
            if 200 <= status_code < 300:
                delivery.status = "delivered"
                delivery.delivered_at = utcnow()
                delivery.next_attempt_at = None
                delivery.last_status_code = status_code
                delivery.last_error = None
                return
            error = f"The server answered {status_code}."
        except ToolInputError as exc:
            error = exc.message
        except httpx.TimeoutException:
            error = "The server took too long to answer."
        except httpx.HTTPError:
            error = "The server could not be reached."
        delivery.last_status_code = status_code
        delivery.last_error = error
        if delivery.attempts >= MAX_ATTEMPTS:
            delivery.status = "failed"
            delivery.next_attempt_at = None
        else:
            delivery.next_attempt_at = utcnow() + timedelta(seconds=RETRY_DELAYS[delivery.attempts - 1])
