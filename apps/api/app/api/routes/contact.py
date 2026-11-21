import time
from html import escape
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, EmailStr, Field

from app.api.deps import ContainerDep, OptionalUser, SessionDep, client_ip_hash, limit_by_ip
from app.core.brand import get_brand
from app.core.errors import AppError
from app.core.logging import get_logger
from app.core.security import sign_value, verify_signed_value
from app.models.user import ContactMessage
from app.schemas.auth import MessageResponse
from app.services.email import OutgoingEmail

router = APIRouter(prefix="/api/v1/contact", tags=["contact"])
log = get_logger(__name__)

MIN_FILL_SECONDS = 3
MAX_TOKEN_AGE_SECONDS = 60 * 60 * 6


class ContactToken(BaseModel):
    token: str


class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    topic: Literal["support", "bug", "feature", "privacy", "security", "other"] = "support"
    message: str = Field(min_length=10, max_length=5000)
    token: str = Field(min_length=10, max_length=200)
    website: str = Field(default="", max_length=200)


def _issue_token(now: int) -> str:
    return f"{now}.{sign_value(f'contact:{now}')}"


def _token_age(token: str, now: int) -> int | None:
    issued, _, signature = token.partition(".")
    if not issued.isdigit() or not verify_signed_value(f"contact:{issued}", signature):
        return None
    return now - int(issued)


@router.get("/token", response_model=ContactToken)
async def contact_token() -> ContactToken:
    return ContactToken(token=_issue_token(int(time.time())))


@router.post("", response_model=MessageResponse, status_code=202)
async def send_message(
    body: ContactRequest,
    request: Request,
    container: ContainerDep,
    session: SessionDep,
    user: OptionalUser,
) -> MessageResponse:
    await limit_by_ip(request, container, "contact", limit=5, window=3600)
    accepted = MessageResponse(
        message="Thanks! Your message is on its way. We usually reply within two working days."
    )
    if body.website:
        return accepted
    age = _token_age(body.token, int(time.time()))
    if age is None or age > MAX_TOKEN_AGE_SECONDS:
        raise AppError("This form has expired.", hint="Reload the page and send your message again.")
    if age < MIN_FILL_SECONDS:
        return accepted
    session.add(
        ContactMessage(
            name=body.name.strip(),
            email=str(body.email),
            topic=body.topic,
            message=body.message.strip(),
            client_ip_hash=client_ip_hash(request),
            user_id=user.id if user else None,
        )
    )
    await session.commit()
    brand = get_brand()
    await container.email_sender.send(
        OutgoingEmail(
            to=brand.support_email,
            subject=f"[{brand.name} contact] {body.topic}: {body.name.strip()[:60]}",
            text=f"From: {body.name} <{body.email}>\nTopic: {body.topic}\n\n{body.message}",
            html=f'<pre style="white-space:pre-wrap;font-family:inherit">{escape(body.message)}</pre>'
            f"<p>From: {escape(body.name)} &lt;{escape(str(body.email))}&gt;</p>",
        )
    )
    log.info("contact_message_received", topic=body.topic)
    return accepted
