import asyncio
import contextlib
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import delete, select, update

from app.core.config import Settings
from app.core.logging import get_logger
from app.core.metrics import FILES_DELETED
from app.db.base import utcnow
from app.db.session import Database
from app.files.render import purge_render_cache
from app.jobs.engine import find_stuck_tasks
from app.models.task import AiUsageEvent, Task, TaskFile, TaskStatus
from app.storage.base import Storage, task_prefix

log = get_logger(__name__)
BATCH_SIZE = 200
ERASED_NAME = "deleted file"
GUEST_RECORD_LIFETIME = timedelta(hours=48)


@dataclass(frozen=True)
class SweepReport:
    expired_tasks: int
    deleted_objects: int
    reaped_tasks: int


class RetentionSweeper:
    def __init__(self, settings: Settings, database: Database, storage: Storage):
        self._settings = settings
        self._db = database
        self._storage = storage

    async def run_once(self) -> SweepReport:
        now = utcnow()
        expired = 0
        deleted = 0
        async with self._db.session() as session:
            rows = await session.scalars(
                select(Task)
                .where(
                    Task.expires_at <= now,
                    Task.files_deleted_at.is_(None),
                    Task.status.not_in([TaskStatus.QUEUED.value, TaskStatus.RUNNING.value]),
                )
                .limit(BATCH_SIZE)
            )
            tasks = list(rows)
            for task in tasks:
                deleted += await asyncio.to_thread(self._storage.delete_prefix, task_prefix(task.id))
                purge_render_cache(self._settings.work_root, [file.id for file in task.files])
                task.files_deleted_at = now
                if not task.state.is_terminal:
                    task.status = TaskStatus.EXPIRED.value
                expired += 1
            await session.commit()
        await self._anonymize_guest_metadata()
        reaped = await self._reap_stuck_tasks()
        if deleted:
            FILES_DELETED.inc(deleted)
        if expired or reaped:
            log.info("retention_sweep", expired_tasks=expired, deleted_objects=deleted, reaped_tasks=reaped)
        return SweepReport(expired_tasks=expired, deleted_objects=deleted, reaped_tasks=reaped)

    async def _anonymize_guest_metadata(self) -> None:
        async with self._db.session() as session:
            deleted_guest_tasks = select(Task.id).where(
                Task.user_id.is_(None), Task.files_deleted_at.is_not(None)
            )
            await session.execute(
                update(TaskFile)
                .where(TaskFile.task_id.in_(deleted_guest_tasks), TaskFile.original_name != ERASED_NAME)
                .values(original_name=ERASED_NAME)
            )
            cutoff = utcnow() - GUEST_RECORD_LIFETIME
            await session.execute(
                delete(Task).where(
                    Task.user_id.is_(None), Task.files_deleted_at.is_not(None), Task.created_at < cutoff
                )
            )
            await session.execute(delete(AiUsageEvent).where(AiUsageEvent.created_at < cutoff))
            await session.commit()

    async def _reap_stuck_tasks(self) -> int:
        stuck = await find_stuck_tasks(self._db, timedelta(seconds=self._settings.job_timeout_seconds * 3))
        if not stuck:
            return 0
        async with self._db.session() as session:
            await session.execute(
                update(Task)
                .where(Task.id.in_(stuck), Task.status == TaskStatus.RUNNING.value)
                .values(
                    status=TaskStatus.FAILED.value,
                    error_code="worker_lost",
                    error_message="Processing was interrupted. Please try again.",
                    finished_at=utcnow(),
                )
            )
            await session.commit()
        return len(stuck)

    async def run_forever(self) -> None:
        while True:
            try:
                await self.run_once()
            except Exception:
                log.exception("retention_sweep_failed")
            await asyncio.sleep(self._settings.sweeper_interval_seconds)


class SweeperHandle:
    def __init__(self, sweeper: RetentionSweeper):
        self._task = asyncio.create_task(sweeper.run_forever())

    async def stop(self) -> None:
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
