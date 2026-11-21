from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, PayloadTooLargeError, ToolInputError
from app.db.base import utcnow
from app.fair_use import FairUse
from app.models.task import AiUsageEvent, Task, TaskStatus
from app.services.principal import Principal
from app.tools.base import Tool


class FairUseLimitError(AppError):
    status_code = 429
    code = "fair_use_limit"

    def __init__(self, message: str, *, reset_at: datetime, reason: str, limit: int):
        retry_after = max(int((reset_at - utcnow()).total_seconds()), 1)
        super().__init__(
            message,
            hint="This limit keeps the service fast and free for everyone. It resets automatically.",
            details={
                "reason": reason,
                "limit": limit,
                "reset_at": reset_at.isoformat(),
                "retry_after": retry_after,
            },
        )
        self.retry_after = retry_after


def format_bytes(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024:
            return f"{round(value, 1):g} {unit}"
        value /= 1024
    return f"{round(value, 1):g} TB"


def _format_reset(reset_at: datetime) -> str:
    return reset_at.astimezone(UTC).strftime("%H:%M UTC")


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _owner_filter(principal: Principal, owner_column: Any, ip_column: Any) -> ColumnElement[bool]:
    condition: ColumnElement[bool] = owner_column == principal.owner_key
    if not principal.is_authenticated:
        condition = or_(condition, ip_column == principal.client_ip_hash)
    return condition


@dataclass(frozen=True)
class WindowUsage:
    used: int
    limit: int
    window_seconds: int
    reset_at: datetime | None


async def task_window_usage(
    session: AsyncSession, principal: Principal, window: timedelta, limit: int
) -> WindowUsage:
    since = utcnow() - window
    condition = _owner_filter(principal, Task.owner_key, Task.client_ip_hash)
    row = (
        await session.execute(
            select(func.count(), func.min(Task.queued_at)).where(condition, Task.queued_at >= since)
        )
    ).one()
    oldest = _aware(row[1])
    return WindowUsage(
        used=int(row[0] or 0),
        limit=limit,
        window_seconds=int(window.total_seconds()),
        reset_at=oldest + window if oldest is not None else None,
    )


async def ai_window_usage(session: AsyncSession, principal: Principal, limit: int) -> WindowUsage:
    window = timedelta(days=1)
    since = utcnow() - window
    condition = _owner_filter(principal, AiUsageEvent.owner_key, AiUsageEvent.client_ip_hash)
    row = (
        await session.execute(
            select(func.count(), func.min(AiUsageEvent.created_at)).where(
                condition, AiUsageEvent.created_at >= since, AiUsageEvent.used_own_key.is_(False)
            )
        )
    ).one()
    oldest = _aware(row[1])
    return WindowUsage(
        used=int(row[0] or 0),
        limit=limit,
        window_seconds=int(window.total_seconds()),
        reset_at=oldest + window if oldest is not None else None,
    )


async def ensure_task_rate(session: AsyncSession, principal: Principal) -> None:
    limits = principal.limits
    for window, limit, label in (
        (timedelta(hours=1), limits.hourly_tasks, "hour"),
        (timedelta(days=1), limits.daily_tasks, "day"),
    ):
        usage = await task_window_usage(session, principal, window, limit)
        if usage.used >= limit and usage.reset_at is not None:
            raise FairUseLimitError(
                f"You've started {limit} tasks in the last {label}, which is the fair-use limit. "
                f"You can start new tasks again at {_format_reset(usage.reset_at)}.",
                reset_at=usage.reset_at,
                reason=f"tasks_per_{label}",
                limit=limit,
            )


async def ensure_ai_quota(session: AsyncSession, principal: Principal) -> None:
    if principal.has_own_ai_key:
        return
    limit = principal.limits.ai_daily_requests
    usage = await ai_window_usage(session, principal, limit)
    if usage.used >= limit and usage.reset_at is not None:
        raise FairUseLimitError(
            f"You've used today's {limit} shared AI requests. They refresh at "
            f"{_format_reset(usage.reset_at)}. You can also add your own AI key in Settings.",
            reset_at=usage.reset_at,
            reason="ai_requests_per_day",
            limit=limit,
        )


def record_ai_usage(session: AsyncSession, principal: Principal, tool_slug: str) -> None:
    session.add(
        AiUsageEvent(
            owner_key=principal.owner_key,
            client_ip_hash=principal.client_ip_hash,
            tool_slug=tool_slug,
            used_own_key=principal.has_own_ai_key,
        )
    )


async def ensure_concurrency(session: AsyncSession, principal: Principal) -> None:
    limit = principal.limits.concurrent_jobs
    active = await session.scalar(
        select(func.count())
        .select_from(Task)
        .where(
            Task.owner_key == principal.owner_key,
            Task.status.in_([TaskStatus.QUEUED.value, TaskStatus.RUNNING.value]),
        )
    )
    if (active or 0) >= limit:
        raise FairUseLimitError(
            f"You already have {active} tasks processing. Start the next one when one of them finishes.",
            reset_at=utcnow() + timedelta(seconds=30),
            reason="concurrent_jobs",
            limit=limit,
        )


def ensure_file_size(size: int, limits: FairUse, tool: Tool[Any]) -> None:
    limit = limits.max_file_bytes
    if tool.input_spec.max_file_bytes is not None:
        limit = min(limit, tool.input_spec.max_file_bytes)
    if size > limit:
        raise PayloadTooLargeError(
            f"This file is {format_bytes(size)}; the maximum is {format_bytes(limit)} per file.",
            hint="Try compressing it first, or split it into smaller parts.",
            details={"reason": "file_too_large", "limit": limit},
        )


def ensure_task_capacity(
    existing_files: int, existing_bytes: int, size: int, limits: FairUse, tool: Tool[Any]
) -> None:
    max_files = min(limits.max_files_per_task, tool.input_spec.max_files)
    if existing_files + 1 > max_files:
        raise ToolInputError(
            f"You can add up to {max_files} files to one task.",
            hint="Remove some files, or process the rest in a second task.",
            details={"reason": "too_many_files", "limit": max_files},
        )
    if existing_bytes + size > limits.max_task_bytes:
        raise PayloadTooLargeError(
            f"These files add up to more than {format_bytes(limits.max_task_bytes)}.",
            hint="Process fewer files at once.",
            details={"reason": "task_too_large", "limit": limits.max_task_bytes},
        )
