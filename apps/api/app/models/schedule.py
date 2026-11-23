from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin, UTCDateTime


class ScheduledWorkflow(IdMixin, TimestampMixin, Base):
    __tablename__ = "scheduled_workflows"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    graph: Mapped[dict[str, Any]] = mapped_column(JSON)
    frequency: Mapped[str] = mapped_column(String(12))
    hour_utc: Mapped[int] = mapped_column(Integer, default=3)
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("library_folders.id", ondelete="SET NULL"), nullable=True
    )
    destination_folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("library_folders.id", ondelete="SET NULL"), nullable=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    next_run_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True, index=True)
    last_run_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    last_status: Mapped[str] = mapped_column(String(200), default="")
    processed_ids: Mapped[list[str]] = mapped_column(JSON, default=list)


class ScheduledRun(IdMixin, TimestampMixin, Base):
    __tablename__ = "scheduled_runs"

    schedule_id: Mapped[str] = mapped_column(
        ForeignKey("scheduled_workflows.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="running", index=True)
    message: Mapped[str] = mapped_column(String(300), default="")
    source_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
