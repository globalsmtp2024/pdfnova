from functools import lru_cache

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


@lru_cache
def get_fair_use() -> FairUse:
    return FairUse()
