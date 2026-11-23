import asyncio
import signal

from app.container import build_container
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.jobs.sweeper import SweeperHandle
from app.services.scheduler import SchedulerWorker
from app.services.webhooks import WebhookWorker

log = get_logger(__name__)


async def run() -> None:
    settings = get_settings()
    configure_logging(settings)
    container = await build_container(settings)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for name in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(name, stop.set)
    webhook_worker = WebhookWorker(settings, container.database) if settings.webhooks_enabled else None
    scheduler_worker = SchedulerWorker(container) if settings.scheduler_enabled else None
    sweeper = SweeperHandle(container.sweeper)
    if webhook_worker is not None:
        webhook_worker.start()
    if scheduler_worker is not None:
        scheduler_worker.start()
    log.info("background_started")
    try:
        await stop.wait()
    finally:
        await sweeper.stop()
        if scheduler_worker is not None:
            await scheduler_worker.stop()
        if webhook_worker is not None:
            await webhook_worker.stop()
        await container.close()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
