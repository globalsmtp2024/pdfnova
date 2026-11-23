from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.routes import (
    account,
    auth,
    cloud,
    contact,
    esign,
    fair_use,
    files,
    health,
    library,
    pages,
    tasks,
    teams,
    tools,
    webhooks,
)
from app.container import Container, build_container
from app.core.brand import get_brand
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.metrics import metrics_middleware
from app.core.middleware import build_http_middleware
from app.jobs.sweeper import SweeperHandle
from app.services.webhooks import WebhookWorker


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment.value,
            traces_sample_rate=0.05,
            send_default_pii=False,
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        owned = container is None
        active = container or await build_container(settings)
        app.state.container = active
        sweeper = SweeperHandle(active.sweeper) if owned and settings.queue_backend == "inline" else None
        webhook_worker = (
            WebhookWorker(settings, active.database) if owned and settings.webhooks_enabled else None
        )
        if webhook_worker is not None:
            webhook_worker.start()
        try:
            yield
        finally:
            if webhook_worker is not None:
                await webhook_worker.stop()
            if sweeper is not None:
                await sweeper.stop()
            if owned:
                await active.close()

    brand = get_brand()
    app = FastAPI(
        title=f"{brand.name} API",
        version="1.0.0",
        description=brand.tagline,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )
    if container is not None:
        app.state.container = container
    install_error_handlers(app)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.middleware("http")(build_http_middleware(settings))
    if settings.metrics_enabled:
        app.middleware("http")(metrics_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "Upload-Offset", "Idempotency-Key", "Authorization"],
        expose_headers=["Upload-Offset", "Upload-Length", "X-Request-ID", "Retry-After"],
        max_age=600,
    )
    for router in (
        health.router,
        auth.router,
        account.router,
        tools.router,
        fair_use.router,
        contact.router,
        tasks.router,
        files.router,
        pages.router,
        esign.router,
        library.router,
        cloud.router,
        teams.router,
        webhooks.router,
    ):
        app.include_router(router)
    return app


app = create_app()
