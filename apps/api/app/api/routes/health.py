import asyncio

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text

from app.api.deps import ContainerDep
from app.core.brand import get_brand
from app.core.errors import NotFoundError

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok", "service": f"{get_brand().name} API"}


@router.get("/health/ready")
async def ready(container: ContainerDep) -> JSONResponse:
    checks: dict[str, str] = {}
    try:
        async with container.database.session() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    try:
        await asyncio.to_thread(container.storage.put_bytes, "health/probe", b"ok")
        checks["storage"] = "ok"
    except Exception:
        checks["storage"] = "error"
    healthy = all(value == "ok" for value in checks.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "degraded", "checks": checks},
    )


@router.get("/metrics", include_in_schema=False)
async def metrics(container: ContainerDep) -> Response:
    if not container.settings.metrics_enabled:
        raise NotFoundError("Not found.")
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
