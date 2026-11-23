import asyncio
import contextlib
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.logging import get_logger
from app.db.base import utcnow
from app.models.library import LibraryFile
from app.models.schedule import ScheduledRun, ScheduledWorkflow
from app.models.task import FileRole, Task, TaskStatus
from app.models.user import User
from app.services import library as library_service
from app.services.principal import Principal
from app.services.tasks import TaskService

log = get_logger(__name__)

POLL_SECONDS = 10
MAX_FILES_PER_RUN = 20
MAX_SCHEDULES_PER_USER = 20
FREQUENCIES = ("hourly", "daily", "weekly")
RUN_TIMEOUT_MINUTES = 60


def compute_next(frequency: str, hour_utc: int, weekday: int | None, after: datetime) -> datetime:
    if frequency == "hourly":
        return (after + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    candidate = after.replace(hour=hour_utc, minute=0, second=0, microsecond=0)
    if frequency == "daily":
        return candidate if candidate > after else candidate + timedelta(days=1)
    target = weekday if weekday is not None else 0
    days = (target - candidate.weekday()) % 7
    candidate += timedelta(days=days)
    return candidate if candidate > after else candidate + timedelta(days=7)


def is_pdf(file: LibraryFile) -> bool:
    return file.mime_type == "application/pdf" or file.name.lower().endswith(".pdf")


async def start_run(
    container: Container, session: AsyncSession, schedule: ScheduledWorkflow, user: User
) -> ScheduledRun | None:
    scope = library_service.Scope(user.id)
    candidates = await library_service.search_files(
        session, scope, schedule.source_folder_id, "", "", False, False
    )
    fresh = [f for f in candidates if is_pdf(f) and f.id not in set(schedule.processed_ids or [])]
    now = utcnow()
    schedule.last_run_at = now
    schedule.next_run_at = (
        compute_next(schedule.frequency, schedule.hour_utc, schedule.weekday, now)
        if schedule.enabled
        else None
    )
    if not fresh:
        schedule.last_status = "No new files"
        await session.commit()
        return None
    batch = fresh[:MAX_FILES_PER_RUN]
    run = ScheduledRun(schedule_id=schedule.id, source_ids=[f.id for f in batch], status="running")
    session.add(run)
    principal = Principal(user=user, anon_id=None, client_ip_hash="scheduler")
    service = TaskService(session, container, principal)
    try:
        task = await service.create("workflow", None)
        for item in batch:
            data = b"".join(container.storage.iter_bytes(item.storage_key))
            upload = await service.create_upload(task, item.name, len(data))
            chunk = container.settings.upload_chunk_size
            for offset in range(0, len(data), chunk):
                upload = await service.receive_chunk(task, upload, offset, data[offset : offset + chunk])
        await session.refresh(task, ["files"])
        await service.start(task, {"nodes": schedule.graph["nodes"], "edges": schedule.graph["edges"]}, None)
        run.task_id = task.id
        schedule.last_status = f"Started with {len(batch)} file(s)"
    except Exception as exc:
        run.status = "failed"
        run.message = str(getattr(exc, "message", exc))[:290]
        run.finished_at = utcnow()
        schedule.last_status = f"Could not start: {run.message}"[:190]
    await session.commit()
    return run


async def finish_run(container: Container, session: AsyncSession, run: ScheduledRun) -> bool:
    schedule = await session.get(ScheduledWorkflow, run.schedule_id)
    task = await session.get(Task, run.task_id) if run.task_id else None
    if schedule is None or task is None:
        run.status = "failed"
        run.message = "The task is gone."
        run.finished_at = utcnow()
        await session.commit()
        return True
    if not task.state.is_terminal:
        if utcnow() - run.created_at > timedelta(minutes=RUN_TIMEOUT_MINUTES):
            run.status = "failed"
            run.message = "The run took too long."
            run.finished_at = utcnow()
            await session.commit()
            return True
        return False
    if task.state is not TaskStatus.SUCCEEDED:
        run.status = "failed"
        run.message = (task.error_message or "The workflow failed.")[:290]
        schedule.last_status = f"Failed: {run.message}"[:190]
        run.finished_at = utcnow()
        await session.commit()
        return True
    saved = 0
    try:
        for output in task.files_with_role(FileRole.OUTPUT):
            if output.kind == "archive":
                continue
            data = b"".join(container.storage.iter_bytes(output.storage_key))
            await library_service.save_bytes(
                container,
                session,
                library_service.Scope(schedule.user_id),
                output.original_name,
                data,
                output.mime_type,
                schedule.destination_folder_id,
                f"schedule:{schedule.name}"[:64],
                output.page_count,
            )
            saved += 1
    except Exception as exc:
        run.status = "failed"
        run.message = str(getattr(exc, "message", exc))[:290]
        schedule.last_status = f"Could not save results: {run.message}"[:190]
        run.finished_at = utcnow()
        await session.commit()
        return True
    schedule.processed_ids = [*(schedule.processed_ids or []), *run.source_ids][-2000:]
    schedule.last_status = f"Saved {saved} file(s)"
    run.status = "succeeded"
    run.message = f"Saved {saved} file(s)"
    run.finished_at = utcnow()
    await session.commit()
    return True


async def tick(container: Container) -> dict[str, Any]:
    started = finished = 0
    async with container.database.session() as session:
        running = list(await session.scalars(select(ScheduledRun).where(ScheduledRun.status == "running")))
        for run in running:
            if await finish_run(container, session, run):
                finished += 1
        due = list(
            await session.scalars(
                select(ScheduledWorkflow).where(
                    ScheduledWorkflow.enabled.is_(True),
                    ScheduledWorkflow.next_run_at.is_not(None),
                    ScheduledWorkflow.next_run_at <= utcnow(),
                )
            )
        )
        for schedule in due:
            user = await session.get(User, schedule.user_id)
            if user is None or not user.is_active:
                schedule.enabled = False
                await session.commit()
                continue
            if await start_run(container, session, schedule, user) is not None:
                started += 1
    return {"started": started, "finished": finished}


class SchedulerWorker:
    def __init__(self, container: Container):
        self._container = container
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
                await tick(self._container)
            except Exception:
                log.exception("scheduler_error")
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._stopping.wait(), POLL_SECONDS)
