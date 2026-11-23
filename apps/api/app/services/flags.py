import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.admin import FeatureFlag

FLAG_DEFAULTS: dict[str, tuple[bool, str]] = {
    "signups": (True, "Allow new accounts to be created"),
    "ai_tools": (True, "Allow the AI tools to run"),
    "url_import": (True, "Allow importing files from a web address"),
    "esign": (True, "Allow new signature requests"),
    "teams": (True, "Allow creating teams"),
    "webhooks": (True, "Allow creating webhooks"),
    "cloud": (True, "Allow connecting cloud accounts"),
}
CACHE_SECONDS = 15.0
_state: dict[str, Any] = {"at": 0.0, "values": None}


def invalidate() -> None:
    _state["values"] = None


async def all_flags(session: AsyncSession) -> dict[str, bool]:
    now = time.monotonic()
    cached = _state["values"]
    if cached is not None and now - float(_state["at"]) < CACHE_SECONDS:
        return dict(cached)
    stored = {row.key: row.enabled for row in await session.scalars(select(FeatureFlag))}
    values = {key: stored.get(key, default) for key, (default, _) in FLAG_DEFAULTS.items()}
    _state["at"] = now
    _state["values"] = values
    return dict(values)


async def require_flag(session: AsyncSession, key: str) -> None:
    if not (await all_flags(session)).get(key, True):
        raise AppError(
            "This feature is temporarily turned off.",
            hint="Please try again later.",
            details={"feature": key},
        )
