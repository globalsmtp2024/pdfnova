import base64
import hashlib
import io
import secrets
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

import pikepdf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.brand import get_brand
from app.core.errors import ConflictError, NotFoundError, ToolInputError
from app.core.logging import get_logger
from app.core.security import hash_token, sign_value
from app.db.base import utcnow
from app.models.esign import (
    FieldKind,
    RecipientStatus,
    SignEvent,
    SignField,
    SignRecipient,
    SignRequest,
    SignRequestStatus,
)
from app.services.email import action_email
from app.services.webhooks import enqueue as enqueue_webhook
from app.text.geometry import page_geometry
from app.text.images import check_image, decode_image_data
from app.text.overlay import OverlayDocument, TextStyle
from app.tools.edit.editor import (
    AnyOperation,
    ImageOp,
    TextOp,
    apply_operations,
)

log = get_logger(__name__)

MAX_RECIPIENTS = 10
MAX_FIELDS = 200
MAX_SIGNATURE_BYTES = 400_000
TOKEN_BYTES = 32
IMAGE_KINDS = {FieldKind.SIGNATURE.value, FieldKind.INITIALS.value}


def storage_key(request_id: str, name: str) -> str:
    return f"esign/{request_id}/{name}"


def read_object(container: Container, key: str) -> bytes:
    return b"".join(container.storage.iter_bytes(key))


async def record_event(
    session: AsyncSession,
    request: SignRequest,
    event: str,
    recipient_id: str | None = None,
    ip_hash: str = "",
    detail: dict[str, Any] | None = None,
) -> None:
    session.add(
        SignEvent(
            request_id=request.id,
            recipient_id=recipient_id,
            event=event,
            ip_hash=ip_hash,
            detail=detail or {},
        )
    )


def inspect_pdf_bytes(data: bytes) -> int:
    try:
        with pikepdf.open(io.BytesIO(data)) as pdf:
            if pdf.is_encrypted:
                raise ToolInputError("Remove the password from this PDF first.")
            return len(pdf.pages)
    except pikepdf.PdfError as exc:
        raise ToolInputError("This PDF could not be read.") from exc


async def create_request(
    container: Container,
    session: AsyncSession,
    owner_id: str,
    filename: str,
    data: bytes,
    title: str,
    message: str,
    expires_days: int,
    recipients: Sequence[dict[str, str]],
    fields: Sequence[dict[str, Any]],
) -> SignRequest:
    if not 1 <= len(recipients) <= MAX_RECIPIENTS:
        raise ToolInputError(f"Add between 1 and {MAX_RECIPIENTS} signers.")
    if not 1 <= len(fields) <= MAX_FIELDS:
        raise ToolInputError(f"Place between 1 and {MAX_FIELDS} fields.")
    pages = inspect_pdf_bytes(data)
    emails = [entry["email"].strip().lower() for entry in recipients]
    if len(set(emails)) != len(emails):
        raise ToolInputError("Each signer needs a different email address.")
    request = SignRequest(
        owner_id=owner_id,
        title=title.strip()[:200] or filename,
        message=message.strip()[:2000],
        status=SignRequestStatus.DRAFT.value,
        original_name=filename[:255],
        original_key="",
        original_sha256=hashlib.sha256(data).hexdigest(),
        page_count=pages,
        expires_at=utcnow() + timedelta(days=expires_days),
    )
    session.add(request)
    await session.flush()
    request.original_key = storage_key(request.id, "original.pdf")
    created: list[SignRecipient] = []
    for position, entry in enumerate(recipients):
        recipient = SignRecipient(
            request_id=request.id,
            position=position,
            name=entry["name"].strip()[:120],
            email=entry["email"].strip().lower(),
        )
        session.add(recipient)
        created.append(recipient)
    await session.flush()
    counts = dict.fromkeys(range(len(created)), 0)
    for spec in fields:
        index = int(spec["recipient"])
        if index not in counts:
            raise ToolInputError("A field belongs to a signer that does not exist.")
        page = int(spec["page"])
        if not 1 <= page <= pages:
            raise ToolInputError(f"A field points at page {page}, but the document has {pages}.")
        kind = FieldKind(spec["kind"])
        counts[index] += 1
        session.add(
            SignField(
                request_id=request.id,
                recipient_id=created[index].id,
                kind=kind.value,
                page=page,
                x=float(spec["x"]),
                y=float(spec["y"]),
                width=float(spec["width"]),
                height=float(spec["height"]),
                required=bool(spec.get("required", True)),
                label=str(spec.get("label", ""))[:120],
            )
        )
    if any(count == 0 for count in counts.values()):
        raise ToolInputError("Every signer needs at least one field to fill in.")
    container.storage.put_bytes(request.original_key, data)
    await record_event(session, request, "created", detail={"title": request.title})
    await session.commit()
    await session.refresh(request)
    return request


def signing_url(container: Container, token: str) -> str:
    return f"{container.settings.public_web_url.rstrip('/')}/en/sign/{token}"


async def issue_token(recipient: SignRecipient, request: SignRequest) -> str:
    token = secrets.token_urlsafe(TOKEN_BYTES)
    recipient.token_hash = hash_token(token)
    recipient.token_expires_at = request.expires_at
    recipient.token_used_at = None
    return token


async def send_invitation(
    container: Container, request: SignRequest, recipient: SignRecipient, token: str, owner_name: str
) -> None:
    brand = get_brand()
    intro = f"{owner_name} asked you to review and sign “{request.title}”."
    if request.message:
        intro += f"\n\nMessage: {request.message}"
    await container.email_sender.send(
        action_email(
            recipient.email,
            f"Please sign: {request.title}",
            intro,
            "Review and sign",
            signing_url(container, token),
            f"This link works once and expires on {request.expires_at:%Y-%m-%d}. "
            f"If you did not expect this, ignore this email. — {brand.name}",
        )
    )


async def send_request(
    container: Container, session: AsyncSession, request: SignRequest, owner_name: str
) -> None:
    if request.status not in {SignRequestStatus.DRAFT.value, SignRequestStatus.SENT.value}:
        raise ConflictError("This request can no longer be sent.")
    if request.expires_at <= utcnow():
        raise ConflictError("This request has expired.")
    targets = [
        r
        for r in request.recipients
        if r.status in {RecipientStatus.PENDING.value, RecipientStatus.VIEWED.value}
    ]
    for recipient in targets:
        token = await issue_token(recipient, request)
        await send_invitation(container, request, recipient, token, owner_name)
        await record_event(
            session, request, "sent", recipient.id, detail={"to_domain": recipient.email.rpartition("@")[2]}
        )
    request.status = SignRequestStatus.SENT.value
    request.sent_at = request.sent_at or utcnow()
    await session.commit()


async def find_recipient(session: AsyncSession, token: str) -> tuple[SignRequest, SignRecipient]:
    recipient = await session.scalar(
        select(SignRecipient).where(SignRecipient.token_hash == hash_token(token))
    )
    if recipient is None:
        raise NotFoundError("This signing link is not valid.")
    request = await session.get(SignRequest, recipient.request_id)
    if request is None:
        raise NotFoundError("This signing link is not valid.")
    return request, recipient


def ensure_open(request: SignRequest, recipient: SignRecipient) -> None:
    now = utcnow()
    if request.status == SignRequestStatus.CANCELLED.value:
        raise ConflictError("The sender cancelled this request.")
    if request.status == SignRequestStatus.DECLINED.value:
        raise ConflictError("This request was declined.")
    if request.status == SignRequestStatus.COMPLETED.value or recipient.token_used_at is not None:
        raise ConflictError("This link has already been used.")
    if (recipient.token_expires_at and recipient.token_expires_at <= now) or request.expires_at <= now:
        raise ConflictError("This signing link has expired.", hint="Ask the sender for a new request.")


def validate_values(fields: Sequence[SignField], values: dict[str, str]) -> dict[str, str]:
    accepted: dict[str, str] = {}
    known = {field.id for field in fields}
    if set(values) - known:
        raise ToolInputError("Some values do not belong to your fields.")
    for field in fields:
        raw = (values.get(field.id) or "").strip()
        if field.kind == FieldKind.DATE.value:
            accepted[field.id] = raw[:10] if raw else f"{utcnow():%Y-%m-%d}"
            continue
        if not raw:
            if field.required and field.kind != FieldKind.CHECKBOX.value:
                raise ToolInputError("Please complete every required field.")
            if field.kind == FieldKind.CHECKBOX.value:
                if field.required:
                    raise ToolInputError("Please tick every required box.")
                accepted[field.id] = "false"
            continue
        if field.kind in IMAGE_KINDS:
            data = decode_image_data(raw)
            if len(data) > MAX_SIGNATURE_BYTES:
                raise ToolInputError("That signature image is too large.")
            check_image(data)
            accepted[field.id] = base64.b64encode(data).decode("ascii")
        elif field.kind == FieldKind.CHECKBOX.value:
            if raw != "true" and field.required:
                raise ToolInputError("Please tick every required box.")
            accepted[field.id] = "true" if raw == "true" else "false"
        else:
            accepted[field.id] = raw[:500]
    return accepted


async def submit_values(
    container: Container,
    session: AsyncSession,
    request: SignRequest,
    recipient: SignRecipient,
    values: dict[str, str],
    ip_hash: str,
) -> bool:
    ensure_open(request, recipient)
    mine = [field for field in request.fields if field.recipient_id == recipient.id]
    accepted = validate_values(mine, values)
    for field in mine:
        field.value = accepted.get(field.id)
    recipient.status = RecipientStatus.SIGNED.value
    recipient.signed_at = utcnow()
    recipient.token_used_at = utcnow()
    recipient.signed_ip_hash = ip_hash
    await record_event(session, request, "signed", recipient.id, ip_hash)
    finished = all(r.status == RecipientStatus.SIGNED.value for r in request.recipients)
    if finished:
        await finalize(container, session, request)
    await session.commit()
    return finished


async def decline(
    container: Container,
    session: AsyncSession,
    request: SignRequest,
    recipient: SignRecipient,
    reason: str,
    ip_hash: str,
) -> None:
    ensure_open(request, recipient)
    recipient.status = RecipientStatus.DECLINED.value
    recipient.declined_at = utcnow()
    recipient.decline_reason = reason.strip()[:500] or None
    recipient.token_used_at = utcnow()
    request.status = SignRequestStatus.DECLINED.value
    await record_event(
        session, request, "declined", recipient.id, ip_hash, {"reason": recipient.decline_reason or ""}
    )
    await enqueue_webhook(
        session,
        request.owner_id,
        "esign.declined",
        {"request_id": request.id, "title": request.title, "signer": recipient.name},
    )
    await session.commit()
    owner = await owner_of(session, request)
    if owner is not None:
        await container.email_sender.send(
            action_email(
                owner.email,
                f"{recipient.name} declined to sign “{request.title}”",
                f"{recipient.name} declined to sign “{request.title}”."
                + (f"\n\nReason: {recipient.decline_reason}" if recipient.decline_reason else ""),
                "Open your signing requests",
                f"{container.settings.public_web_url.rstrip('/')}/en/dashboard/signatures",
                "No further signatures will be collected for this request.",
            )
        )


async def owner_of(session: AsyncSession, request: SignRequest) -> Any:
    from app.models.user import User

    return await session.get(User, request.owner_id)


def operations_for(request: SignRequest) -> list[AnyOperation]:
    operations: list[AnyOperation] = []
    for field in request.fields:
        if not field.value:
            continue
        if field.kind in IMAGE_KINDS:
            operations.append(
                ImageOp(
                    type="image",
                    page=field.page,
                    x=field.x,
                    y=field.y,
                    width=field.width,
                    height=field.height,
                    image_data=field.value,
                )
            )
        elif field.kind == FieldKind.CHECKBOX.value:
            if field.value == "true":
                operations.append(
                    TextOp(
                        type="text",
                        page=field.page,
                        x=field.x,
                        y=field.y,
                        text="X",
                        size=max(field.height * 5, 8),
                        bold=True,
                    )
                )
        else:
            operations.append(
                TextOp(
                    type="text",
                    page=field.page,
                    x=field.x,
                    y=field.y,
                    text=field.value,
                    size=max(min(field.height * 6, 14), 7),
                    color="#0B1B6B",
                )
            )
    return operations


def certificate_lines(request: SignRequest, document_hash: str) -> list[tuple[str, float, bool]]:
    brand = get_brand()
    lines: list[tuple[str, float, bool]] = [
        ("Certificate of completion", 20, True),
        (brand.name, 10, False),
        ("", 8, False),
        (f"Document: {request.title}", 11, True),
        (f"Request ID: {request.id}", 9, False),
        (f"Original SHA-256: {request.original_sha256}", 8, False),
        (f"Signed content SHA-256: {document_hash}", 8, False),
        (f"Completed: {utcnow():%Y-%m-%d %H:%M UTC}", 9, False),
        ("", 8, False),
        ("Signers", 12, True),
    ]
    for recipient in request.recipients:
        when = f"{recipient.signed_at:%Y-%m-%d %H:%M UTC}" if recipient.signed_at else "not signed"
        proof = f" · network ref {recipient.signed_ip_hash[:10]}" if recipient.signed_ip_hash else ""
        lines.append((f"{recipient.name} <{recipient.email}> — {recipient.status}, {when}{proof}", 9, False))
    lines.append(("", 8, False))
    lines.append(("Audit trail", 12, True))
    for event in request.events:
        who = next((r.name for r in request.recipients if r.id == event.recipient_id), "Sender")
        lines.append((f"{event.created_at:%Y-%m-%d %H:%M:%S UTC}  {event.event}  {who}", 8, False))
    return lines


def append_certificate(pdf: pikepdf.Pdf, request: SignRequest, document_hash: str) -> None:
    from app.text.geometry import translate

    pdf.add_blank_page(page_size=(595, 842))
    page = pdf.pages[-1]
    overlay = OverlayDocument(pdf, prefix="Cert")
    geometry = page_geometry(page)
    cursor = geometry.visual_height - 56.0
    for text, size, bold in certificate_lines(request, document_hash):
        if not text:
            cursor -= size
            continue
        style = TextStyle(font="noto-sans", size=size, bold=bold, align="left")
        stamp = overlay.text_stamp(text[:150], style)
        cursor -= stamp.height
        if cursor < 40:
            break
        overlay.place(page, stamp, translate(48, cursor))
        cursor -= 4
    overlay.finalize()


async def finalize(container: Container, session: AsyncSession, request: SignRequest) -> None:
    original = read_object(container, request.original_key)
    with pikepdf.open(io.BytesIO(original)) as pdf:
        apply_operations(pdf, operations_for(request))
        content = io.BytesIO()
        pdf.save(content)
    document_hash = hashlib.sha256(content.getvalue()).hexdigest()
    request.status = SignRequestStatus.COMPLETED.value
    request.completed_at = utcnow()
    await record_event(session, request, "completed")
    await enqueue_webhook(
        session,
        request.owner_id,
        "esign.completed",
        {"request_id": request.id, "title": request.title, "signers": len(request.recipients)},
    )
    await session.flush()
    await session.refresh(request, attribute_names=["events"])
    with pikepdf.open(io.BytesIO(content.getvalue())) as pdf:
        append_certificate(pdf, request, document_hash)
        output = io.BytesIO()
        pdf.save(output)
    signed = output.getvalue()
    request.signed_key = storage_key(request.id, "signed.pdf")
    request.signed_sha256 = hashlib.sha256(signed).hexdigest()
    container.storage.put_bytes(request.signed_key, signed)
    owner = await owner_of(session, request)
    download = completed_download_url(container, request)
    for recipient in request.recipients:
        await container.email_sender.send(
            action_email(
                recipient.email,
                f"Completed: {request.title}",
                f"Hi {recipient.name}, everyone has signed “{request.title}”.",
                "Download the signed document",
                download,
                "The signed PDF includes a certificate of completion with the audit trail.",
            )
        )
    if owner is not None:
        await container.email_sender.send(
            action_email(
                owner.email,
                f"Completed: {request.title}",
                f"Everyone has signed “{request.title}”.",
                "Open the signed document",
                f"{container.settings.public_web_url.rstrip('/')}/en/dashboard/signatures",
                "The signed PDF includes a certificate of completion with the audit trail.",
            )
        )


def completed_download_signature(request_id: str) -> str:
    return sign_value(f"esign-completed:{request_id}")


def completed_download_url(container: Container, request: SignRequest) -> str:
    base = container.settings.public_api_url.rstrip("/")
    return f"{base}/api/v1/esign/completed/{request.id}/{completed_download_signature(request.id)}"
