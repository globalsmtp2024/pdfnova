from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, BigInteger, Boolean, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin, UTCDateTime


class TaskStatus(StrEnum):
    CREATED = "created"
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"

    @property
    def is_terminal(self) -> bool:
        return self in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.EXPIRED}


class FileRole(StrEnum):
    INPUT = "input"
    OUTPUT = "output"


class FileStatus(StrEnum):
    UPLOADING = "uploading"
    READY = "ready"
    REJECTED = "rejected"


class Task(IdMixin, TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (UniqueConstraint("owner_key", "idempotency_key"),)

    owner_key: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    client_ip_hash: Mapped[str] = mapped_column(String(64), index=True, default="")
    tool_slug: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(16), default=TaskStatus.CREATED.value, index=True)
    retention_seconds: Mapped[int] = mapped_column(Integer, default=3600)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    api_key_id: Mapped[str | None] = mapped_column(
        ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True
    )
    options: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    progress_label: Mapped[str] = mapped_column(String(120), default="")
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    input_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    output_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    queued_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    files_deleted_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    secrets_sealed: Mapped[str | None] = mapped_column(String(8192), nullable=True)

    files: Mapped[list["TaskFile"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TaskFile.position",
    )

    @property
    def state(self) -> TaskStatus:
        return TaskStatus(self.status)

    def files_with_role(self, role: FileRole) -> list["TaskFile"]:
        return [f for f in self.files if f.role == role.value]


class TaskFile(IdMixin, TimestampMixin, Base):
    __tablename__ = "task_files"

    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(8))
    position: Mapped[int] = mapped_column(Integer, default=0)
    original_name: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(512))
    declared_size: Mapped[int] = mapped_column(BigInteger, default=0)
    received_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    parts_received: Mapped[int] = mapped_column(Integer, default=0)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    mime_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    kind: Mapped[str] = mapped_column(String(32), default="unknown")
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=FileStatus.UPLOADING.value)
    rejection_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    encrypted: Mapped[bool] = mapped_column(Boolean, default=False)
    inspection: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    task: Mapped[Task] = relationship(back_populates="files")


class AiUsageEvent(IdMixin, TimestampMixin, Base):
    __tablename__ = "ai_usage_events"

    owner_key: Mapped[str] = mapped_column(String(64), index=True)
    client_ip_hash: Mapped[str] = mapped_column(String(64), index=True)
    tool_slug: Mapped[str] = mapped_column(String(64))
    used_own_key: Mapped[bool] = mapped_column(Boolean, default=False)
