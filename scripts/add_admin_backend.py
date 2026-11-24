from pathlib import Path

API = Path(__file__).resolve().parent.parent / "apps" / "api" / "app" / "api" / "routes"

ADDITION = '''

@router.post("/auth/login", response_model=LoginResponse, dependencies=[Depends(auth_attempt_limit)])
async def admin_login(
    body: LoginRequest,
    request: Request,
    response: Response,
    service: AuthServiceDep,
    session: SessionDep,
    settings: SettingsDep,
) -> LoginResponse:
    user = await service.authenticate(body.email, body.password)
    if not user.is_admin:
        raise PermissionDeniedError("This account is not an administrator.")
    if user.totp_enabled:
        await session.commit()
        return LoginResponse(mfa_required=True, mfa_token=service.issue_mfa_challenge(user))
    return await complete_login(service, session, user, request, response, settings)


@router.get("/analytics")
async def analytics(session: SessionDep, _: AdminUser, days: int = 30) -> dict[str, Any]:
    span = max(1, min(days, 90))
    now = utcnow()
    since = now - timedelta(days=span)
    week = now - timedelta(days=7)

    async def scalar(statement: Any) -> int:
        return int(await session.scalar(statement) or 0)

    users_total = await scalar(select(func.count()).select_from(User))
    users_verified = await scalar(
        select(func.count()).select_from(User).where(User.email_verified_at.is_not(None))
    )
    users_admin = await scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True)))
    users_new_period = await scalar(
        select(func.count()).select_from(User).where(User.created_at >= since)
    )
    users_new_week = await scalar(select(func.count()).select_from(User).where(User.created_at >= week))
    users_active_week = await scalar(
        select(func.count()).select_from(User).where(User.last_login_at >= week)
    )
    tasks_total = await scalar(select(func.count()).select_from(Task))
    in_period = Task.created_at >= since
    tasks_period = await scalar(select(func.count()).select_from(Task).where(in_period))
    succeeded = await scalar(
        select(func.count()).select_from(Task).where(in_period, Task.status == TaskStatus.SUCCEEDED.value)
    )
    failed = await scalar(
        select(func.count()).select_from(Task).where(in_period, Task.status == TaskStatus.FAILED.value)
    )
    signed_in_tasks = await scalar(
        select(func.count()).select_from(Task).where(in_period, Task.user_id.is_not(None))
    )
    api_tasks = await scalar(
        select(func.count()).select_from(Task).where(in_period, Task.api_key_id.is_not(None))
    )
    input_bytes = await scalar(select(func.sum(Task.input_bytes)).where(in_period))
    output_bytes = await scalar(select(func.sum(Task.output_bytes)).where(in_period))
    ai_requests = await scalar(
        select(func.count()).select_from(AiUsageEvent).where(AiUsageEvent.created_at >= since)
    )
    open_reports = await scalar(
        select(func.count()).select_from(AbuseReport).where(AbuseReport.status == "open")
    )

    duration_rows = (
        await session.execute(
            select(Task.started_at, Task.finished_at).where(
                in_period, Task.started_at.is_not(None), Task.finished_at.is_not(None)
            )
        )
    ).all()
    durations = [(finished - started).total_seconds() for started, finished in duration_rows]

    signup_rows = (
        await session.execute(
            select(func.date(User.created_at), func.count())
            .where(User.created_at >= since)
            .group_by(func.date(User.created_at))
        )
    ).all()
    task_rows = (
        await session.execute(
            select(
                func.date(Task.created_at),
                func.count(),
                func.sum(case((Task.status == TaskStatus.FAILED.value, 1), else_=0)),
            )
            .where(in_period)
            .group_by(func.date(Task.created_at))
        )
    ).all()
    signups = {str(day): count for day, count in signup_rows}
    tasks_by_day = {str(day): (count, int(bad or 0)) for day, count, bad in task_rows}
    series = []
    for offset in range(span - 1, -1, -1):
        day = (now - timedelta(days=offset)).date().isoformat()
        total, bad = tasks_by_day.get(day, (0, 0))
        series.append({"date": day, "tasks": total, "failed": bad, "signups": signups.get(day, 0)})

    tool_rows = (
        await session.execute(
            select(Task.tool_slug, func.count())
            .where(in_period)
            .group_by(Task.tool_slug)
            .order_by(func.count().desc())
        )
    ).all()
    registry = get_registry()
    categories: dict[str, int] = {}
    for slug, count in tool_rows:
        tool = registry.get(slug) if slug in registry else None
        label = tool.category.value if tool is not None else "other"
        categories[label] = categories.get(label, 0) + count
    used_slugs = {slug for slug, _ in tool_rows}
    unused = sorted(slug for slug in registry if slug not in used_slugs)

    recent_users = (
        await session.scalars(select(User).order_by(User.created_at.desc()).limit(8))
    ).all()
    finished_tasks = succeeded + failed
    return {
        "days": span,
        "users": {
            "total": users_total,
            "verified": users_verified,
            "admins": users_admin,
            "new_in_period": users_new_period,
            "new_this_week": users_new_week,
            "active_this_week": users_active_week,
        },
        "tasks": {
            "total": tasks_total,
            "in_period": tasks_period,
            "succeeded": succeeded,
            "failed": failed,
            "success_rate": round(succeeded / finished_tasks * 100, 1) if finished_tasks else None,
            "signed_in": signed_in_tasks,
            "guest": tasks_period - signed_in_tasks,
            "via_api": api_tasks,
            "avg_seconds": round(sum(durations) / len(durations), 2) if durations else 0,
            "p95_seconds": round(percentile(durations, 0.95), 2),
            "input_bytes": input_bytes,
            "output_bytes": output_bytes,
        },
        "ai_requests": ai_requests,
        "open_reports": open_reports,
        "series": series,
        "top_tools": [{"tool": slug, "total": count} for slug, count in tool_rows[:10]],
        "categories": [
            {"category": label, "total": count}
            for label, count in sorted(categories.items(), key=lambda item: -item[1])
        ],
        "unused_tools": unused,
        "recent_users": [
            {
                "id": person.id,
                "email": person.email,
                "display_name": person.display_name,
                "created_at": person.created_at.isoformat(),
            }
            for person in recent_users
        ],
    }
'''


def replace_once(text, old, new):
    assert old in text, old[:60]
    return text.replace(old, new, 1)


admin = API / "admin.py"
text = admin.read_text(encoding="utf8")
text = replace_once(text, "from fastapi import APIRouter, Request\n", "from fastapi import APIRouter, Depends, Request, Response\n")
text = replace_once(
    text,
    "from app.core.errors import ConflictError, NotFoundError, ToolInputError",
    "from app.api.routes.auth import AuthServiceDep, auth_attempt_limit, complete_login\nfrom app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ToolInputError",
)
text = replace_once(text, "from app.models.task import Task, TaskStatus", "from app.models.task import AiUsageEvent, Task, TaskStatus")
text = replace_once(
    text,
    "from app.api.deps import AdminUser, ContainerDep, OptionalUser, SessionDep, client_ip_hash, limit_by_ip",
    "from app.api.deps import (\n    AdminUser,\n    ContainerDep,\n    OptionalUser,\n    SessionDep,\n    SettingsDep,\n    client_ip_hash,\n    limit_by_ip,\n)",
)
text = replace_once(text, "from app.models.user import User\n", "from app.models.user import User\nfrom app.schemas.auth import LoginRequest, LoginResponse\n")
text = replace_once(
    text,
    "from app.tools.convert.external import CHROME_NAMES, find_binary",
    "from app.tools.convert.external import CHROME_NAMES, find_binary\nfrom app.tools.registry import get_registry",
)
text = replace_once(text, "from sqlalchemy import func, or_, select, text", "from sqlalchemy import case, func, or_, select, text")
text += ADDITION
admin.write_text(text, encoding="utf8")

auth = API / "auth.py"
text = auth.read_text(encoding="utf8")
text = text.replace("_complete_login(", "complete_login(")
auth.write_text(text, encoding="utf8")
print("ok")
