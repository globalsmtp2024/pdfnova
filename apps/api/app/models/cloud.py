from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin, UTCDateTime


class CloudConnection(IdMixin, TimestampMixin, Base):
    __tablename__ = "cloud_connections"
    __table_args__ = (UniqueConstraint("user_id", "provider"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    account_label: Mapped[str] = mapped_column(String(320), default="")
    access_token_sealed: Mapped[str] = mapped_column(String(4096))
    refresh_token_sealed: Mapped[str | None] = mapped_column(String(4096), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
