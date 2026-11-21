from typing import Any, ClassVar

from arq import Retry, cron
from arq.connections import RedisSettings

from app.container import build_container
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.jobs.engine import InfrastructureError
from app.jobs.queue import (
    DEFAULT_QUEUE,
    HIGH_PRIORITY_QUEUE,
    MAX_ATTEMPTS,
    OFFICE_QUEUE,
    retry_delay_seconds,
)


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    configure_logging(settings)
    ctx["container"] = await build_container(settings)


async def shutdown(ctx: dict[str, Any]) -> None:
    container = ctx.get("container")
    if container is not None:
        await container.close()


async def run_task(ctx: dict[str, Any], task_id: str) -> str:
    container = ctx["container"]
    attempt = int(ctx.get("job_try", 1))
    try:
        outcome = await container.engine.execute(task_id)
    except InfrastructureError as exc:
        if attempt >= MAX_ATTEMPTS:
            await container.engine.mark_dead_letter(task_id)
            return "dead_letter"
        raise Retry(defer=retry_delay_seconds(attempt)) from exc
    return str(outcome)


async def sweep(ctx: dict[str, Any]) -> None:
    await ctx["container"].sweeper.run_once()


def _redis_settings() -> RedisSettings:
    url = get_settings().redis_url
    if not url:
        raise RuntimeError("REDIS_URL is required for the worker")
    return RedisSettings.from_dsn(url)


class HighPriorityWorker:
    functions: ClassVar[list[Any]] = [run_task]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = HIGH_PRIORITY_QUEUE
    max_jobs = 4
    max_tries = MAX_ATTEMPTS
    job_timeout = get_settings().job_timeout_seconds + 120
    redis_settings = _redis_settings() if get_settings().queue_backend == "arq" else RedisSettings()


class DefaultWorker:
    functions: ClassVar[list[Any]] = [run_task]
    cron_jobs: ClassVar[list[Any]] = [cron(sweep, second={0, 30}, run_at_startup=True, unique=True)]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = DEFAULT_QUEUE
    max_jobs = 4
    max_tries = MAX_ATTEMPTS
    job_timeout = get_settings().job_timeout_seconds + 120
    redis_settings = _redis_settings() if get_settings().queue_backend == "arq" else RedisSettings()


class OfficeWorker:
    functions: ClassVar[list[Any]] = [run_task]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = OFFICE_QUEUE
    max_jobs = 2
    max_tries = MAX_ATTEMPTS
    job_timeout = get_settings().job_timeout_seconds + 120
    redis_settings = _redis_settings() if get_settings().queue_backend == "arq" else RedisSettings()
