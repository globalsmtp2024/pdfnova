from functools import lru_cache
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

MB = 1024 * 1024
HOUR = 3600


class FairUse(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FAIR_USE_", env_file=".env", extra="ignore", frozen=True)

    max_file_bytes: int = Field(default=200 * MB, gt=0)
    max_task_bytes: int = Field(default=2048 * MB, gt=0)
    max_files_per_task: int = Field(default=100, gt=0)
    concurrent_jobs: int = Field(default=4, gt=0)
    hourly_tasks: int = Field(default=120, gt=0)
    daily_tasks: int = Field(default=600, gt=0)
    ai_daily_requests: int = Field(default=40, gt=0)
    requests_per_minute: int = Field(default=600, gt=0)
    retention_seconds: int = Field(default=1 * HOUR, gt=0)
    extended_retention_seconds: int = Field(default=24 * HOUR, gt=0)
    library_bytes: int = Field(default=1024 * MB, gt=0)
    library_trash_days: int = Field(default=30, gt=0)
    interactive_priority: int = 5
    api_priority: int = 0


EDITABLE_KEYS: tuple[str, ...] = (
    "max_file_bytes",
    "max_task_bytes",
    "max_files_per_task",
    "concurrent_jobs",
    "hourly_tasks",
    "daily_tasks",
    "ai_daily_requests",
    "requests_per_minute",
    "retention_seconds",
    "extended_retention_seconds",
    "library_bytes",
    "library_trash_days",
)
_overrides: dict[str, int] = {}


@lru_cache
def _build(items: tuple[tuple[str, int], ...]) -> FairUse:
    values: dict[str, Any] = dict(items)
    return FairUse(**values)


def get_overrides() -> dict[str, int]:
    return dict(_overrides)


def set_overrides(values: dict[str, int]) -> None:
    _overrides.clear()
    _overrides.update({key: value for key, value in values.items() if key in EDITABLE_KEYS and value > 0})


class _FairUseProvider:
    def __call__(self) -> FairUse:
        return _build(tuple(sorted(_overrides.items())))

    def cache_clear(self) -> None:
        _build.cache_clear()


get_fair_use = _FairUseProvider()
