import asyncio
from collections import Counter
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.crypto import load_key, open_text, seal_text
from app.core.errors import AppError, AuthenticationError, NotFoundError
from app.core.security import generate_token, hash_token, verify_password
from app.db.base import utcnow
from app.models.task import Task
from app.models.user import ApiKey, User
from app.storage.base import task_prefix

AI_PROVIDERS = ("anthropic", "openai", "google", "mistral")
API_KEY_PREFIX = "pnk_"
MAX_ACTIVE_API_KEYS = 20


class AccountService:
    def __init__(self, session: AsyncSession, container: Container):
        self._session = session
        self._container = container

    async def set_ai_key(self, user: User, provider: str, api_key: str) -> None:
        if provider not in AI_PROVIDERS:
            raise AppError(
                f"Unsupported AI provider '{provider}'.", hint=f"Choose one of: {', '.join(AI_PROVIDERS)}."
            )
        cleaned = api_key.strip()
        if len(cleaned) < 16 or any(char.isspace() for char in cleaned):
            raise AppError(
                "This does not look like a valid API key.", hint="Paste the full key from your provider."
            )
        key = load_key(self._container.settings.storage_encryption_key.get_secret_value())
        user.ai_provider = provider
        user.ai_api_key_encrypted = seal_text(key, cleaned)
        user.ai_key_last4 = cleaned[-4:]

    async def test_ai_key(self, user: User, provider: str | None, api_key: str | None) -> tuple[bool, str]:
        import asyncio
        import os

        from app.ai.provider import BASE_URLS, DEFAULT_MODELS, HttpProvider
        from app.tools.base import ToolFailedError

        name = provider or user.ai_provider or "anthropic"
        if name not in AI_PROVIDERS:
            return False, f"Unsupported AI provider '{name}'."
        secret = api_key.strip() if api_key else None
        if secret is None:
            if user.ai_api_key_encrypted is None:
                return False, "No AI key is saved yet."
            secret = open_text(
                load_key(self._container.settings.storage_encryption_key.get_secret_value()),
                user.ai_api_key_encrypted,
            )
        base = os.environ.get("AI_BASE_URL_OVERRIDE") or BASE_URLS[name]
        model = os.environ.get("AI_MODEL_OVERRIDE") or DEFAULT_MODELS[name]
        probe = HttpProvider(name=name, key=secret, model=model, base_url=base.rstrip("/"))
        try:
            await asyncio.to_thread(probe.complete, "Reply with the single word OK.", "Say OK.", 8)
        except ToolFailedError as exc:
            return False, exc.message
        return True, "The key works."

    def clear_ai_key(self, user: User) -> None:
        user.ai_provider = None
        user.ai_api_key_encrypted = None
        user.ai_key_last4 = None

    async def list_api_keys(self, user: User) -> list[ApiKey]:
        rows = await self._session.scalars(
            select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc())
        )
        return list(rows)

    async def create_api_key(self, user: User, name: str) -> tuple[ApiKey, str]:
        active = [key for key in await self.list_api_keys(user) if key.revoked_at is None]
        if len(active) >= MAX_ACTIVE_API_KEYS:
            raise AppError(
                f"You can have up to {MAX_ACTIVE_API_KEYS} active API keys.",
                hint="Revoke a key you no longer use.",
            )
        raw = API_KEY_PREFIX + generate_token(30)
        record = ApiKey(
            user_id=user.id, name=name.strip()[:80] or "API key", prefix=raw[:12], key_hash=hash_token(raw)
        )
        self._session.add(record)
        await self._session.flush()
        return record, raw

    async def revoke_api_key(self, user: User, key_id: str) -> None:
        record = await self._session.get(ApiKey, key_id)
        if record is None or record.user_id != user.id:
            raise NotFoundError("This API key does not exist.")
        record.revoked_at = record.revoked_at or utcnow()

    async def api_usage(self, user: User, days: int = 14) -> dict[str, Any]:
        since = utcnow() - timedelta(days=days)
        rows = await self._session.execute(
            select(Task.api_key_id, Task.queued_at).where(
                Task.user_id == user.id, Task.queued_at.is_not(None), Task.queued_at >= since
            )
        )
        per_day: Counter[str] = Counter()
        per_key: Counter[str] = Counter()
        for key_id, queued_at in rows:
            per_day[queued_at.date().isoformat()] += 1
            per_key[key_id or "web"] += 1
        today = utcnow().date()
        series = [
            {
                "date": (today - timedelta(days=offset)).isoformat(),
                "tasks": per_day[(today - timedelta(days=offset)).isoformat()],
            }
            for offset in range(days - 1, -1, -1)
        ]
        return {"days": series, "by_key": dict(per_key)}

    async def recent_tasks(self, user: User, limit: int = 50) -> list[Task]:
        rows = await self._session.scalars(
            select(Task).where(Task.user_id == user.id).order_by(Task.created_at.desc()).limit(limit)
        )
        return list(rows)

    async def export(self, user: User) -> dict[str, Any]:
        tasks = await self.recent_tasks(user, limit=10_000)
        keys = await self.list_api_keys(user)
        return {
            "exported_at": utcnow().isoformat(),
            "account": {
                "id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "created_at": user.created_at.isoformat(),
                "email_verified": user.email_verified_at is not None,
                "locale": user.locale,
                "two_factor_enabled": user.totp_enabled,
                "retention_extended": user.retention_extended,
                "ai_provider": user.ai_provider,
                "linked_sign_in_providers": [account.provider for account in user.oauth_accounts],
            },
            "api_keys": [
                {
                    "name": key.name,
                    "prefix": key.prefix,
                    "created_at": key.created_at.isoformat(),
                    "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
                    "revoked_at": key.revoked_at.isoformat() if key.revoked_at else None,
                }
                for key in keys
            ],
            "tasks": [
                {
                    "id": task.id,
                    "tool": task.tool_slug,
                    "status": task.status,
                    "created_at": task.created_at.isoformat(),
                    "finished_at": task.finished_at.isoformat() if task.finished_at else None,
                    "input_bytes": task.input_bytes,
                    "output_bytes": task.output_bytes,
                    "files": [file.original_name for file in task.files],
                }
                for task in tasks
            ],
        }

    async def delete_account(self, user: User, password: str, confirm_email: str) -> None:
        if user.password_hash is not None:
            if not verify_password(password, user.password_hash):
                raise AuthenticationError("Your password is incorrect.")
        elif confirm_email.strip().lower() != user.email:
            raise AppError("Type your email address exactly to confirm.")
        task_ids = list(await self._session.scalars(select(Task.id).where(Task.user_id == user.id)))
        for task_id in task_ids:
            await asyncio.to_thread(self._container.storage.delete_prefix, task_prefix(task_id))
        await self._session.delete(user)
