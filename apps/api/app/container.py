from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from app.core.config import Settings
from app.core.ratelimit import RateLimiter, build_rate_limiter
from app.db.session import Database
from app.files.render import PageRenderer
from app.jobs.engine import JobEngine
from app.jobs.queue import JobQueue, build_queue
from app.jobs.sweeper import RetentionSweeper
from app.services.email import EmailSender, build_email_sender
from app.services.url_import import ImportedFile, fetch_url
from app.storage import Storage, build_storage
from app.tools.registry import ToolRegistry, get_registry


@dataclass
class Container:
    settings: Settings
    database: Database
    storage: Storage
    registry: ToolRegistry
    engine: JobEngine
    queue: JobQueue
    rate_limiter: RateLimiter
    email_sender: EmailSender
    sweeper: RetentionSweeper
    url_fetcher: Callable[[str, int], Awaitable[ImportedFile]] = fetch_url
    renderer: PageRenderer = field(default_factory=PageRenderer)

    async def close(self) -> None:
        self.renderer.close()
        await self.queue.close()
        await self.database.dispose()


async def build_container(settings: Settings) -> Container:
    settings.work_root.mkdir(parents=True, exist_ok=True)
    database = Database(settings)
    storage = build_storage(settings)
    registry = get_registry()
    engine = JobEngine(settings, database, storage, registry)
    queue = await build_queue(settings, engine)
    return Container(
        settings=settings,
        database=database,
        storage=storage,
        registry=registry,
        engine=engine,
        queue=queue,
        rate_limiter=build_rate_limiter(settings),
        email_sender=build_email_sender(settings),
        sweeper=RetentionSweeper(settings, database, storage),
    )
