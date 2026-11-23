from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin, UTCDateTime


class SignRequestStatus(StrEnum):
    DRAFT = "draft"
    SENT = "sent"
    COMPLETED = "completed"
    DECLINED = "declined"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class RecipientStatus(StrEnum):
    PENDING = "pending"
    VIEWED = "viewed"
    SIGNED = "signed"
    DECLINED = "declined"


class FieldKind(StrEnum):
    SIGNATURE = "signature"
    INITIALS = "initials"
    DATE = "date"
    TEXT = "text"
    CHECKBOX = "checkbox"


class SignRequest(IdMixin, TimestampMixin, Base):
    __tablename__ = "sign_requests"

    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(String(2000), default="")
    status: Mapped[str] = mapped_column(String(16), default=SignRequestStatus.DRAFT.value, index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    original_key: Mapped[str] = mapped_column(String(512))
    original_sha256: Mapped[str] = mapped_column(String(64))
    signed_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    signed_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    recipients: Mapped[list["SignRecipient"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SignRecipient.position",
    )
    fields: Mapped[list["SignField"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", lazy="selectin"
    )
    events: Mapped[list["SignEvent"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SignEvent.created_at",
    )


class SignRecipient(IdMixin, TimestampMixin, Base):
    __tablename__ = "sign_recipients"

    request_id: Mapped[str] = mapped_column(ForeignKey("sign_requests.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320))
    status: Mapped[str] = mapped_column(String(12), default=RecipientStatus.PENDING.value)
    token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    token_used_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    viewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    declined_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    decline_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    signed_ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reminder_count: Mapped[int] = mapped_column(Integer, default=0)

    request: Mapped[SignRequest] = relationship(back_populates="recipients")


class SignField(IdMixin, TimestampMixin, Base):
    __tablename__ = "sign_fields"

    request_id: Mapped[str] = mapped_column(ForeignKey("sign_requests.id", ondelete="CASCADE"), index=True)
    recipient_id: Mapped[str] = mapped_column(
        ForeignKey("sign_recipients.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(12))
    page: Mapped[int] = mapped_column(Integer)
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    width: Mapped[float] = mapped_column(Float)
    height: Mapped[float] = mapped_column(Float)
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    label: Mapped[str] = mapped_column(String(120), default="")
    value: Mapped[str | None] = mapped_column(Text, nullable=True)

    request: Mapped[SignRequest] = relationship(back_populates="fields")


class SignEvent(IdMixin, TimestampMixin, Base):
    __tablename__ = "sign_events"

    request_id: Mapped[str] = mapped_column(ForeignKey("sign_requests.id", ondelete="CASCADE"), index=True)
    recipient_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    event: Mapped[str] = mapped_column(String(24))
    ip_hash: Mapped[str] = mapped_column(String(64), default="")
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    request: Mapped[SignRequest] = relationship(back_populates="events")
