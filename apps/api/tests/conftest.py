import os
from collections.abc import AsyncIterator, Callable, Iterator
from pathlib import Path

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

os.environ.setdefault("ENVIRONMENT", "test")

from app.container import Container, build_container
from app.core.config import Environment, Settings
from app.db.base import Base
from app.fair_use import get_fair_use
from app.jobs.queue import InlineQueue
from app.main import create_app
from app.services.email import ConsoleEmailSender

TEST_CHUNK_SIZE = 8 * 1024


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        environment=Environment.TEST,
        database_url=f"sqlite+aiosqlite:///{(tmp_path / 'test.db').as_posix()}",
        storage_local_root=tmp_path / "storage",
        work_root=tmp_path / "work",
        upload_chunk_size=TEST_CHUNK_SIZE,
        public_api_url="http://testserver",
        public_web_url="http://web.test",
        job_timeout_seconds=120,
        google_client_id="google-client",
        google_client_secret="google-secret",  # type: ignore[arg-type]
        github_client_id="github-client",
        github_client_secret="github-secret",  # type: ignore[arg-type]
    )


async def create_schema(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


@pytest.fixture
async def container(settings: Settings) -> AsyncIterator[Container]:
    built = await build_container(settings)
    await create_schema(built.database.engine)
    yield built
    await built.close()


@pytest.fixture
def outbox(container: Container) -> list:
    sender = container.email_sender
    assert isinstance(sender, ConsoleEmailSender)
    return sender.outbox


@pytest.fixture
def inline_queue(container: Container) -> InlineQueue:
    queue = container.queue
    assert isinstance(queue, InlineQueue)
    return queue


class CsrfClient(httpx.AsyncClient):
    async def send(self, request: httpx.Request, **kwargs: object) -> httpx.Response:  # type: ignore[override]
        token = self.cookies.get("pn_csrf")
        if token and "x-csrf-token" not in request.headers and not getattr(self, "skip_csrf", False):
            request.headers["x-csrf-token"] = token
        return await super().send(request, **kwargs)  # type: ignore[arg-type]


@pytest.fixture
async def client(settings: Settings, container: Container) -> AsyncIterator[CsrfClient]:
    app = create_app(settings, container)
    transport = httpx.ASGITransport(app=app)
    async with CsrfClient(transport=transport, base_url="http://testserver") as http:
        await http.get("/api/v1/auth/csrf")
        yield http


@pytest.fixture
def fair_use_override(monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[..., None]]:
    def apply(**limits: int) -> None:
        for name, value in limits.items():
            monkeypatch.setenv(f"FAIR_USE_{name.upper()}", str(value))
        get_fair_use.cache_clear()

    yield apply
    monkeypatch.undo()
    get_fair_use.cache_clear()


@pytest.fixture
def fixtures_dir(tmp_path: Path) -> Iterator[Path]:
    path = tmp_path / "fixtures"
    path.mkdir()
    yield path
