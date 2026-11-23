import asyncio
import contextlib
import shutil
import time
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import delete, select, update

from app.core.config import Settings
from app.core.logging import get_logger
from app.core.metrics import FILES_DELETED
from app.db.base import utcnow
from app.db.session import Database
from app.jobs.engine import find_stuck_tasks
from app.models.esign import SignRequest, SignRequestStatus
from app.models.schedule import ScheduledRun
from app.models.task import AiUsageEvent, Task, TaskFile, TaskStatus
from app.models.user import OneTimeToken, RefreshToken
from app.models.webhook import WebhookDelivery
from app.services.erasure import erase_prefix, erase_task_data
from app.services.library import purge_expired_trash
from app.storage.base import Storage

log = get_logger(__name__)
BATCH_SIZE = 200
WEBHOOK_LOG_DAYS = 30
RUN_LOG_DAYS = 90
TOKEN_GRACE_DAYS = 7
ESIGN_STALE_DAYS = 30
ORPHAN_HOURS = 24
ERASED_NAME = "deleted file"
GUEST_RECORD_LIFETIME = timedelta(hours=48)


@dataclass(frozen=True)
class SweepReport:
    expired_tasks: int
    deleted_objects: int
    reaped_tasks: int
    purged_trash: int = 0
    purged_esign: int = 0
    purged_orphans: int = 0


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
                report = await erase_task_data(
                    self._storage, self._settings.work_root, task.id, [file.id for file in task.files]
                )
                deleted += report.deleted_objects
                task.files_deleted_at = now
                if not task.state.is_terminal:
                    task.status = TaskStatus.EXPIRED.value
                expired += 1
            await session.commit()
        await self._anonymize_guest_metadata()
        reaped = await self._reap_stuck_tasks()
        purged_trash, purged_esign = await self._purge_account_data()
        purged_orphans = await asyncio.to_thread(self._purge_orphans)
        if deleted:
            FILES_DELETED.inc(deleted)
        if expired or reaped:
            log.info("retention_sweep", expired_tasks=expired, deleted_objects=deleted, reaped_tasks=reaped)
        return SweepReport(
            expired_tasks=expired,
            deleted_objects=deleted,
            reaped_tasks=reaped,
            purged_trash=purged_trash,
            purged_esign=purged_esign,
            purged_orphans=purged_orphans,
        )

    async def _purge_account_data(self) -> tuple[int, int]:
        now = utcnow()
        purged_esign = 0
        async with self._db.session() as session:
            trash = await purge_expired_trash(self._storage, session)
            await session.execute(
                delete(WebhookDelivery).where(
                    WebhookDelivery.created_at < now - timedelta(days=WEBHOOK_LOG_DAYS)
                )
            )
            await session.execute(
                delete(ScheduledRun).where(ScheduledRun.created_at < now - timedelta(days=RUN_LOG_DAYS))
            )
            await session.execute(
                delete(OneTimeToken).where(OneTimeToken.expires_at < now - timedelta(days=TOKEN_GRACE_DAYS))
            )
            await session.execute(
                delete(RefreshToken).where(RefreshToken.expires_at < now - timedelta(days=TOKEN_GRACE_DAYS))
            )
            await session.execute(
                update(SignRequest)
                .where(SignRequest.status == SignRequestStatus.SENT.value, SignRequest.expires_at < now)
                .values(status=SignRequestStatus.EXPIRED.value)
            )
            stale = await session.scalars(
                select(SignRequest).where(
                    SignRequest.status.in_(
                        [
                            SignRequestStatus.EXPIRED.value,
                            SignRequestStatus.CANCELLED.value,
                            SignRequestStatus.DRAFT.value,
                        ]
                    ),
                    SignRequest.expires_at < now - timedelta(days=ESIGN_STALE_DAYS),
                )
            )
            for request in list(stale):
                if await erase_prefix(self._storage, f"esign/{request.id}"):
                    await session.delete(request)
                    purged_esign += 1
            await session.commit()
        return trash, purged_esign

    def _purge_orphans(self) -> int:
        removed = 0
        cutoff = time.time() - ORPHAN_HOURS * 3600
        root = self._settings.work_root.resolve()
        if not root.exists():
            return 0
        for entry in root.iterdir():
            try:
                if entry.name in {"render", "uploads"}:
                    for child in entry.iterdir():
                        if child.stat().st_mtime < cutoff:
                            shutil.rmtree(child, ignore_errors=True) if child.is_dir() else child.unlink(
                                missing_ok=True
                            )
                            removed += 1
                elif entry.is_dir() and entry.stat().st_mtime < cutoff:
                    shutil.rmtree(entry, ignore_errors=True)
                    removed += 1
            except OSError:
                continue
        return removed

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
