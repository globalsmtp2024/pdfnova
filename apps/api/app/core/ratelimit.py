import asyncio
import time
from dataclasses import dataclass
from typing import Protocol

from redis.asyncio import Redis

from app.core.config import Settings


@dataclass(frozen=True)
class RateDecision:
    allowed: bool
    remaining: int
    retry_after: int


class RateLimiter(Protocol):
    async def hit(self, key: str, limit: int, window_seconds: int) -> RateDecision: ...


class MemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, tuple[int, int]] = {}
        self._lock = asyncio.Lock()

    async def hit(self, key: str, limit: int, window_seconds: int) -> RateDecision:
        now = int(time.time())
        window_start = now - now % window_seconds
        bucket_key = f"{key}:{window_start}"
        async with self._lock:
            if len(self._buckets) > 50_000:
                self._buckets = {k: v for k, v in self._buckets.items() if v[1] > now}
            count, expires = self._buckets.get(bucket_key, (0, window_start + window_seconds))
            count += 1
            self._buckets[bucket_key] = (count, expires)
        retry_after = max(expires - now, 1)
        return RateDecision(allowed=count <= limit, remaining=max(limit - count, 0), retry_after=retry_after)


class RedisRateLimiter:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def hit(self, key: str, limit: int, window_seconds: int) -> RateDecision:
        now = int(time.time())
        window_start = now - now % window_seconds
        bucket_key = f"rl:{key}:{window_start}"
        pipe = self._redis.pipeline()
        pipe.incr(bucket_key)
        pipe.expire(bucket_key, window_seconds + 1)
        count, _ = await pipe.execute()
        retry_after = max(window_start + window_seconds - now, 1)
        return RateDecision(
            allowed=int(count) <= limit, remaining=max(limit - int(count), 0), retry_after=retry_after
        )


def build_rate_limiter(settings: Settings) -> RateLimiter:
    if settings.rate_limit_backend == "redis":
        if not settings.redis_url:
            raise RuntimeError("REDIS_URL is required for the redis rate limiter")
        return RedisRateLimiter(Redis.from_url(settings.redis_url))
    return MemoryRateLimiter()
