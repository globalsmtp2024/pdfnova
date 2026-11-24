from pathlib import Path

ADMIN = Path(__file__).resolve().parent.parent / "apps" / "api" / "app" / "api" / "routes" / "admin.py"

DETAIL = '''

@router.get("/users/{user_id}/detail")
async def user_detail(user_id: str, session: SessionDep, _: AdminUser) -> dict[str, Any]:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError("That user was not found.")
    now = utcnow()
    month = now - timedelta(days=30)

    async def count(statement: Any) -> int:
        return int(await session.scalar(statement) or 0)

    mine = Task.user_id == user.id
    tasks_total = await count(select(func.count()).select_from(Task).where(mine))
    tasks_month = await count(select(func.count()).select_from(Task).where(mine, Task.created_at >= month))
    succeeded = await count(
        select(func.count()).select_from(Task).where(mine, Task.status == TaskStatus.SUCCEEDED.value)
    )
    failed = await count(
        select(func.count()).select_from(Task).where(mine, Task.status == TaskStatus.FAILED.value)
    )
    input_bytes = await count(select(func.sum(Task.input_bytes)).where(mine))
    top_tools = (
        await session.execute(
            select(Task.tool_slug, func.count())
            .where(mine)
            .group_by(Task.tool_slug)
            .order_by(func.count().desc())
            .limit(5)
        )
    ).all()
    recent = (
        await session.scalars(select(Task).where(mine).order_by(Task.created_at.desc()).limit(8))
    ).all()
    api_keys = await count(
        select(func.count()).select_from(ApiKey).where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
    )
    webhooks = await count(select(func.count()).select_from(Webhook).where(Webhook.user_id == user.id))
    teams = await count(select(func.count()).select_from(TeamMember).where(TeamMember.user_id == user.id))
    library_files = await count(
        select(func.count()).select_from(LibraryFile).where(LibraryFile.user_id == user.id)
    )
    schedules = await count(
        select(func.count()).select_from(ScheduledWorkflow).where(ScheduledWorkflow.user_id == user.id)
    )
    sessions_open = await count(
        select(func.count())
        .select_from(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
    )
    providers = list(
        await session.scalars(select(OAuthAccount.provider).where(OAuthAccount.user_id == user.id))
    )
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "email_verified": user.email_verified_at is not None,
        "retention_extended": user.retention_extended,
        "two_step": user.totp_enabled,
        "locale": user.locale,
        "created_at": user.created_at.isoformat(),
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "failed_logins": user.failed_login_count,
        "locked": bool(user.locked_until and user.locked_until > now),
        "oauth": providers,
        "ai_provider": user.ai_provider,
        "tasks": {
            "total": tasks_total,
            "last_30_days": tasks_month,
            "succeeded": succeeded,
            "failed": failed,
            "input_bytes": input_bytes,
        },
        "top_tools": [{"tool": slug, "total": total} for slug, total in top_tools],
        "recent_tasks": [
            {
                "id": task.id,
                "tool": task.tool_slug,
                "status": task.status,
                "error_code": task.error_code,
                "created_at": task.created_at.isoformat(),
            }
            for task in recent
        ],
        "assets": {
            "api_keys": api_keys,
            "webhooks": webhooks,
            "teams": teams,
            "library_files": library_files,
            "schedules": schedules,
            "open_sessions": sessions_open,
        },
    }
'''

text = ADMIN.read_text(encoding="utf8")
anchor = '\n\n@router.get("/flags")'
assert anchor in text
text = text.replace(anchor, DETAIL + anchor, 1)
text = text.replace(
    "from app.models.user import User\n",
    "from app.models.library import LibraryFile\nfrom app.models.schedule import ScheduledWorkflow\nfrom app.models.team import TeamMember\nfrom app.models.user import ApiKey, OAuthAccount, RefreshToken, User\nfrom app.models.webhook import Webhook\n",
    1,
)
old = '            "active_this_week": users_active_week,\n        },'
new = '            "active_this_week": users_active_week,\n            "disabled": users_disabled,\n            "unverified": users_total - users_verified,\n            "two_step": users_two_step,\n        },'
assert old in text
text = text.replace(old, new, 1)
marker = "    tasks_total = await scalar(select(func.count()).select_from(Task))\n"
add = '''    users_disabled = await scalar(
        select(func.count()).select_from(User).where(User.is_active.is_(False))
    )
    users_two_step = await scalar(
        select(func.count()).select_from(User).where(User.totp_enabled.is_(True))
    )
'''
assert marker in text
text = text.replace(marker, add + marker, 1)
ADMIN.write_text(text, encoding="utf8")
print("ok")
