import asyncio
import contextlib

from sqlalchemy import select

from app.core.logging import get_logger
from app.db.session import Database
from app.fair_use import EDITABLE_KEYS, set_overrides
from app.models.admin import SiteSetting

log = get_logger(__name__)
POLL_SECONDS = 30
FAIR_USE_KEY = "fair_use"
ANNOUNCEMENT_KEY = "announcement"


async def load_fair_use(database: Database) -> None:
    async with database.session() as session:
        row = await session.scalar(select(SiteSetting).where(SiteSetting.key == FAIR_USE_KEY))
    values = row.value if row is not None else {}
    set_overrides({key: int(value) for key, value in values.items() if key in EDITABLE_KEYS})


class SiteSyncWorker:
    def __init__(self, database: Database):
        self._database = database
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
                await load_fair_use(self._database)
            except Exception:
                log.exception("site_sync_error")
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._stopping.wait(), POLL_SECONDS)
