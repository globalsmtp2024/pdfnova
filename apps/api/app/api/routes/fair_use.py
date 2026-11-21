from datetime import datetime, timedelta

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import PrincipalDep, SessionDep
from app.fair_use import get_fair_use
from app.models.task import Task, TaskStatus
from app.services.quota import ai_window_usage, task_window_usage

router = APIRouter(prefix="/api/v1", tags=["fair use"])


class FairUsePolicy(BaseModel):
    max_file_bytes: int
    max_task_bytes: int
    max_files_per_task: int
    concurrent_jobs: int
    hourly_tasks: int
    daily_tasks: int
    ai_daily_requests: int
    requests_per_minute: int
    retention_seconds: int
    extended_retention_seconds: int


class UsageWindow(BaseModel):
    used: int
    limit: int
    window_seconds: int
    reset_at: datetime | None


class UsageResponse(BaseModel):
    hourly_tasks: UsageWindow
    daily_tasks: UsageWindow
    ai_requests: UsageWindow
    active_jobs: int
    concurrent_jobs_limit: int
    uses_own_ai_key: bool
    retention_seconds: int


@router.get("/fair-use", response_model=FairUsePolicy)
async def fair_use_policy() -> FairUsePolicy:
    return FairUsePolicy.model_validate(get_fair_use().model_dump())


@router.get("/usage", response_model=UsageResponse)
async def current_usage(principal: PrincipalDep, session: SessionDep) -> UsageResponse:
    limits = principal.limits
    hourly = await task_window_usage(session, principal, timedelta(hours=1), limits.hourly_tasks)
    daily = await task_window_usage(session, principal, timedelta(days=1), limits.daily_tasks)
    ai = await ai_window_usage(session, principal, limits.ai_daily_requests)
    active = await session.scalar(
        select(func.count())
        .select_from(Task)
        .where(
            Task.owner_key == principal.owner_key,
            Task.status.in_([TaskStatus.QUEUED.value, TaskStatus.RUNNING.value]),
        )
    )
    return UsageResponse(
        hourly_tasks=UsageWindow(**hourly.__dict__),
        daily_tasks=UsageWindow(**daily.__dict__),
        ai_requests=UsageWindow(**ai.__dict__),
        active_jobs=int(active or 0),
        concurrent_jobs_limit=limits.concurrent_jobs,
        uses_own_ai_key=principal.has_own_ai_key,
        retention_seconds=principal.retention_seconds,
    )
