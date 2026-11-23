from typing import Any, Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import ContainerDep, CurrentUser, SessionDep, limit_by_user
from app.core.errors import ConflictError, NotFoundError, ToolInputError
from app.db.base import utcnow
from app.models.schedule import ScheduledRun, ScheduledWorkflow
from app.services import library as library_service
from app.services import scheduler as service
from app.tools.organize.workflow import WorkflowEdge, WorkflowNode, graph_order

router = APIRouter(prefix="/api/v1/schedules", tags=["schedules"])


class ScheduleIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    nodes: list[WorkflowNode] = Field(min_length=1, max_length=12)
    edges: list[WorkflowEdge] = Field(default_factory=list, max_length=48)
    frequency: Literal["hourly", "daily", "weekly"] = "daily"
    hour_utc: int = Field(default=3, ge=0, le=23)
    weekday: int | None = Field(default=None, ge=0, le=6)
    source_folder_id: str | None = None
    destination_folder_id: str | None = None
    enabled: bool = True


class ScheduleOut(BaseModel):
    id: str
    name: str
    graph: dict[str, Any]
    frequency: str
    hour_utc: int
    weekday: int | None
    source_folder_id: str | None
    destination_folder_id: str | None
    enabled: bool
    next_run_at: str | None
    last_run_at: str | None
    last_status: str


class RunOut(BaseModel):
    id: str
    status: str
    message: str
    files: int
    created_at: str
    finished_at: str | None


def out(schedule: ScheduledWorkflow) -> ScheduleOut:
    return ScheduleOut(
        id=schedule.id,
        name=schedule.name,
        graph=schedule.graph,
        frequency=schedule.frequency,
        hour_utc=schedule.hour_utc,
        weekday=schedule.weekday,
        source_folder_id=schedule.source_folder_id,
        destination_folder_id=schedule.destination_folder_id,
        enabled=schedule.enabled,
        next_run_at=schedule.next_run_at.isoformat() if schedule.next_run_at else None,
        last_run_at=schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        last_status=schedule.last_status,
    )


async def owned(session: SessionDep, user_id: str, schedule_id: str) -> ScheduledWorkflow:
    schedule = await session.get(ScheduledWorkflow, schedule_id)
    if schedule is None or schedule.user_id != user_id:
        raise NotFoundError("That schedule was not found.")
    return schedule


async def check_body(session: SessionDep, user_id: str, body: ScheduleIn) -> None:
    try:
        graph_order(body.nodes, body.edges)
    except ValueError as exc:
        raise ToolInputError(str(exc)) from exc
    from app.tools.organize.workflow import check_step

    for node in body.nodes:
        check_step(node.tool).parse_options(node.options)
    scope = library_service.Scope(user_id)
    for folder_id in (body.source_folder_id, body.destination_folder_id):
        if folder_id is not None:
            await library_service.get_folder(session, scope, folder_id)
    if body.frequency == "weekly" and body.weekday is None:
        raise ToolInputError("Choose a weekday for a weekly schedule.")


def graph_of(body: ScheduleIn) -> dict[str, Any]:
    return {
        "nodes": [node.model_dump() for node in body.nodes],
        "edges": [edge.model_dump() for edge in body.edges],
    }


@router.get("", response_model=list[ScheduleOut])
async def list_schedules(session: SessionDep, user: CurrentUser) -> list[ScheduleOut]:
    rows = await session.scalars(
        select(ScheduledWorkflow)
        .where(ScheduledWorkflow.user_id == user.id)
        .order_by(ScheduledWorkflow.created_at)
    )
    return [out(row) for row in rows]


@router.post("", response_model=ScheduleOut, status_code=201)
async def create_schedule(body: ScheduleIn, session: SessionDep, user: CurrentUser) -> ScheduleOut:
    existing = list(
        await session.scalars(select(ScheduledWorkflow).where(ScheduledWorkflow.user_id == user.id))
    )
    if len(existing) >= service.MAX_SCHEDULES_PER_USER:
        raise ConflictError("You have reached the schedule limit.")
    await check_body(session, user.id, body)
    schedule = ScheduledWorkflow(
        user_id=user.id,
        name=body.name.strip(),
        graph=graph_of(body),
        frequency=body.frequency,
        hour_utc=body.hour_utc,
        weekday=body.weekday,
        source_folder_id=body.source_folder_id,
        destination_folder_id=body.destination_folder_id,
        enabled=body.enabled,
        next_run_at=service.compute_next(body.frequency, body.hour_utc, body.weekday, utcnow())
        if body.enabled
        else None,
    )
    session.add(schedule)
    await session.commit()
    return out(schedule)


@router.put("/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    schedule_id: str, body: ScheduleIn, session: SessionDep, user: CurrentUser
) -> ScheduleOut:
    schedule = await owned(session, user.id, schedule_id)
    await check_body(session, user.id, body)
    schedule.name = body.name.strip()
    schedule.graph = graph_of(body)
    schedule.frequency = body.frequency
    schedule.hour_utc = body.hour_utc
    schedule.weekday = body.weekday
    schedule.source_folder_id = body.source_folder_id
    schedule.destination_folder_id = body.destination_folder_id
    schedule.enabled = body.enabled
    schedule.next_run_at = (
        service.compute_next(body.frequency, body.hour_utc, body.weekday, utcnow()) if body.enabled else None
    )
    await session.commit()
    return out(schedule)


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: str, session: SessionDep, user: CurrentUser) -> Response:
    schedule = await owned(session, user.id, schedule_id)
    await session.delete(schedule)
    await session.commit()
    return Response(status_code=204)


@router.post("/{schedule_id}/run", response_model=ScheduleOut)
async def run_now(
    schedule_id: str, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> ScheduleOut:
    await limit_by_user(container, user, "schedule-run", limit=30, window=3600)
    schedule = await owned(session, user.id, schedule_id)
    await service.start_run(container, session, schedule, user)
    return out(schedule)


@router.get("/{schedule_id}/runs", response_model=list[RunOut])
async def list_runs(schedule_id: str, session: SessionDep, user: CurrentUser) -> list[RunOut]:
    await owned(session, user.id, schedule_id)
    rows = await session.scalars(
        select(ScheduledRun)
        .where(ScheduledRun.schedule_id == schedule_id)
        .order_by(ScheduledRun.created_at.desc())
        .limit(50)
    )
    return [
        RunOut(
            id=row.id,
            status=row.status,
            message=row.message,
            files=len(row.source_ids or []),
            created_at=row.created_at.isoformat(),
            finished_at=row.finished_at.isoformat() if row.finished_at else None,
        )
        for row in rows
    ]
