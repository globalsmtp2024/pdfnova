import asyncio
from typing import Protocol

from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

from app.core.config import Settings
from app.core.logging import get_logger
from app.jobs.engine import InfrastructureError, JobEngine

log = get_logger(__name__)

HIGH_PRIORITY_QUEUE = "pdfnova:high"
DEFAULT_QUEUE = "pdfnova:default"
OFFICE_QUEUE = "pdfnova:office"
HIGH_PRIORITY_THRESHOLD = 5
MAX_ATTEMPTS = 4


def queue_for_priority(priority: int) -> str:
    return HIGH_PRIORITY_QUEUE if priority >= HIGH_PRIORITY_THRESHOLD else DEFAULT_QUEUE


def retry_delay_seconds(attempt: int) -> float:
    return float(min(2**attempt, 60))


class JobQueue(Protocol):
    async def enqueue(self, task_id: str, priority: int) -> None: ...

    async def close(self) -> None: ...


class InlineQueue:
    def __init__(self, engine: JobEngine, concurrency: int = 2, retry_base_seconds: float = 1.0):
        self._engine = engine
        self._semaphore = asyncio.Semaphore(concurrency)
        self._pending: set[asyncio.Task[None]] = set()
        self._retry_base_seconds = retry_base_seconds

    async def enqueue(self, task_id: str, priority: int) -> None:
        job = asyncio.create_task(self._run(task_id))
        self._pending.add(job)
        job.add_done_callback(self._pending.discard)

    async def _run(self, task_id: str) -> None:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                async with self._semaphore:
                    await self._engine.execute(task_id)
                return
            except InfrastructureError:
                log.warning("task_retry", task_id=task_id, attempt=attempt)
                if attempt < MAX_ATTEMPTS:
                    await asyncio.sleep(retry_delay_seconds(attempt) * self._retry_base_seconds)
            except Exception:
                log.exception("task_crashed", task_id=task_id)
                break
        await self._engine.mark_dead_letter(task_id)

    async def drain(self) -> None:
        while self._pending:
            await asyncio.gather(*list(self._pending), return_exceptions=True)

    async def close(self) -> None:
        for job in list(self._pending):
            job.cancel()
        await asyncio.gather(*list(self._pending), return_exceptions=True)


class ArqQueue:
    def __init__(self, pool: ArqRedis):
        self._pool = pool

    @classmethod
    async def connect(cls, redis_url: str) -> "ArqQueue":
        return cls(await create_pool(RedisSettings.from_dsn(redis_url)))

    async def enqueue(self, task_id: str, priority: int) -> None:
        await self._pool.enqueue_job(
            "run_task", task_id, _job_id=f"task:{task_id}", _queue_name=queue_for_priority(priority)
        )

    async def close(self) -> None:
        await self._pool.aclose()


async def build_queue(settings: Settings, engine: JobEngine) -> JobQueue:
    if settings.queue_backend == "arq":
        if not settings.redis_url:
            raise RuntimeError("REDIS_URL is required for the arq queue backend")
        return await ArqQueue.connect(settings.redis_url)
    return InlineQueue(engine)
