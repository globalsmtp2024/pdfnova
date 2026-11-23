import shutil
import time
from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text

from app.api.deps import AdminUser, ContainerDep, OptionalUser, SessionDep, client_ip_hash, limit_by_ip
from app.core.errors import ConflictError, NotFoundError, ToolInputError
from app.db.base import utcnow
from app.fair_use import EDITABLE_KEYS, get_fair_use
from app.models.admin import AbuseReport, SiteSetting
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.services import flags as flag_service
from app.services.site_sync import ANNOUNCEMENT_KEY, FAIR_USE_KEY, load_fair_use
from app.tools.convert.external import CHROME_NAMES, find_binary

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])
public = APIRouter(prefix="/api/v1", tags=["site"])

STARTED_AT = time.time()
BINARIES: dict[str, tuple[str, tuple[str, ...]]] = {
    "qpdf": ("QPDF_BINARY", ("qpdf",)),
    "libreoffice": ("SOFFICE_BINARY", ("soffice", "libreoffice")),
    "tesseract": ("TESSERACT_BINARY", ("tesseract",)),
    "chromium": ("CHROMIUM_BINARY", CHROME_NAMES),
}


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    is_active: bool
    is_admin: bool
    email_verified: bool
    retention_extended: bool
    created_at: str
    last_login_at: str | None
    tasks_30d: int


class UserPatch(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    retention_extended: bool | None = None


class AnnouncementBody(BaseModel):
    enabled: bool = False
    message_en: str = Field(default="", max_length=200)
    message_ur: str = Field(default="", max_length=200)
    href: str = Field(default="", max_length=500)


class ReportIn(BaseModel):
    kind: Literal["task", "file", "esign", "user", "link", "other"] = "other"
    target: str = Field(default="", max_length=200)
    reason: str = Field(min_length=10, max_length=1000)


class ResolveIn(BaseModel):
    status: Literal["actioned", "dismissed"]
    note: str = Field(default="", max_length=500)
    deactivate_user_id: str | None = None


@router.get("/health")
async def health(container: ContainerDep, session: SessionDep, _: AdminUser) -> dict[str, Any]:
    checks: dict[str, Any] = {}
    try:
        await session.execute(text("select 1"))
        checks["database"] = {"ok": True}
    except Exception as exc:
        checks["database"] = {"ok": False, "error": type(exc).__name__}
    try:
        container.storage.put_bytes("health/ping", b"ok")
        ok = b"".join(container.storage.iter_bytes("health/ping")) == b"ok"
        container.storage.delete("health/ping")
        checks["storage"] = {"ok": ok}
    except Exception as exc:
        checks["storage"] = {"ok": False, "error": type(exc).__name__}
    usage = shutil.disk_usage(container.settings.work_root)
    checks["disk"] = {
        "ok": usage.free > 512 * 1024 * 1024,
        "free_bytes": usage.free,
        "total_bytes": usage.total,
    }
    checks["binaries"] = {
        name: {"ok": find_binary(env, names, ()) is not None} for name, (env, names) in BINARIES.items()
    }
    checks["queue"] = {"ok": True, "backend": container.settings.queue_backend}
    day_ago = utcnow() - timedelta(days=1)
    counts = {
        "users": await session.scalar(select(func.count()).select_from(User)),
        "tasks_24h": await session.scalar(
            select(func.count()).select_from(Task).where(Task.created_at >= day_ago)
        ),
        "failed_24h": await session.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.created_at >= day_ago, Task.status == TaskStatus.FAILED.value)
        ),
        "running": await session.scalar(
            select(func.count()).select_from(Task).where(Task.status == TaskStatus.RUNNING.value)
        ),
    }
    return {
        "uptime_seconds": int(time.time() - STARTED_AT),
        "environment": container.settings.environment.value,
        "checks": checks,
        "counts": counts,
    }


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(int(len(ordered) * fraction), len(ordered) - 1)]


@router.get("/jobs")
async def job_metrics(session: SessionDep, _: AdminUser, days: int = 7) -> dict[str, Any]:
    since = utcnow() - timedelta(days=max(1, min(days, 90)))
    rows = list(await session.scalars(select(Task).where(Task.created_at >= since)))
    per_tool: dict[str, dict[str, Any]] = {}
    per_day: dict[str, dict[str, int]] = {}
    for task in rows:
        entry = per_tool.setdefault(
            task.tool_slug, {"total": 0, "succeeded": 0, "failed": 0, "durations": []}
        )
        entry["total"] += 1
        if task.status == TaskStatus.SUCCEEDED.value:
            entry["succeeded"] += 1
        elif task.status == TaskStatus.FAILED.value:
            entry["failed"] += 1
        if task.started_at and task.finished_at:
            entry["durations"].append((task.finished_at - task.started_at).total_seconds())
        day = per_day.setdefault(task.created_at.date().isoformat(), {"total": 0, "failed": 0})
        day["total"] += 1
        if task.status == TaskStatus.FAILED.value:
            day["failed"] += 1
    tools = [
        {
            "tool": slug,
            "total": data["total"],
            "succeeded": data["succeeded"],
            "failed": data["failed"],
            "avg_seconds": round(sum(data["durations"]) / len(data["durations"]), 2)
            if data["durations"]
            else 0,
            "p95_seconds": round(percentile(data["durations"], 0.95), 2),
        }
        for slug, data in per_tool.items()
    ]
    tools.sort(key=lambda item: item["total"], reverse=True)
    return {
        "days": [{"date": day, **values} for day, values in sorted(per_day.items())],
        "tools": tools,
    }


@router.get("/failures")
async def failures(
    session: SessionDep, _: AdminUser, tool: str = "", code: str = "", limit: int = 50
) -> list[dict[str, Any]]:
    statement = select(Task).where(Task.status == TaskStatus.FAILED.value)
    if tool:
        statement = statement.where(Task.tool_slug == tool)
    if code:
        statement = statement.where(Task.error_code == code)
    rows = await session.scalars(statement.order_by(Task.created_at.desc()).limit(max(1, min(limit, 200))))
    return [
        {
            "id": task.id,
            "tool": task.tool_slug,
            "error_code": task.error_code,
            "error_message": task.error_message,
            "created_at": task.created_at.isoformat(),
            "attempts": task.attempts,
            "input_bytes": task.input_bytes,
            "signed_in": task.user_id is not None,
        }
        for task in rows
    ]


@router.get("/users", response_model=list[UserOut])
async def list_users(
    session: SessionDep, _: AdminUser, q: str = "", limit: int = 50, offset: int = 0
) -> list[UserOut]:
    statement = select(User).order_by(User.created_at.desc())
    if q.strip():
        like = f"%{q.strip().replace('%', '').replace('_', '')}%"
        statement = statement.where(or_(User.email.ilike(like), User.display_name.ilike(like)))
    users = list(await session.scalars(statement.limit(max(1, min(limit, 200))).offset(max(offset, 0))))
    since = utcnow() - timedelta(days=30)
    counted = await session.execute(
        select(Task.user_id, func.count())
        .where(Task.created_at >= since, Task.user_id.in_([u.id for u in users]))
        .group_by(Task.user_id)
    )
    counts: dict[str, int] = {str(row[0]): int(row[1]) for row in counted.all()}
    return [
        UserOut(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            is_active=user.is_active,
            is_admin=user.is_admin,
            email_verified=user.email_verified_at is not None,
            retention_extended=user.retention_extended,
            created_at=user.created_at.isoformat(),
            last_login_at=user.last_login_at.isoformat() if user.last_login_at else None,
            tasks_30d=int(counts.get(user.id, 0)),
        )
        for user in users
    ]


@router.patch("/users/{user_id}", response_model=UserOut)
async def patch_user(user_id: str, body: UserPatch, session: SessionDep, admin: AdminUser) -> UserOut:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError("That user was not found.")
    if user.id == admin.id and (body.is_active is False or body.is_admin is False):
        raise ConflictError("You cannot remove your own access.")
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.retention_extended is not None:
        user.retention_extended = body.retention_extended
    await session.commit()
    return (await list_users(session, admin, q=user.email, limit=1, offset=0))[0]


@router.get("/flags")
async def get_flags(session: SessionDep, _: AdminUser) -> list[dict[str, Any]]:
    values = await flag_service.all_flags(session)
    return [
        {"key": key, "enabled": values[key], "description": description}
        for key, (_, description) in flag_service.FLAG_DEFAULTS.items()
    ]


@router.put("/flags/{key}")
async def set_flag(key: str, body: dict[str, bool], session: SessionDep, _: AdminUser) -> dict[str, Any]:
    from app.models.admin import FeatureFlag

    if key not in flag_service.FLAG_DEFAULTS or "enabled" not in body:
        raise ToolInputError("Unknown feature flag.")
    row = await session.get(FeatureFlag, key)
    if row is None:
        session.add(FeatureFlag(key=key, enabled=body["enabled"]))
    else:
        row.enabled = body["enabled"]
    await session.commit()
    flag_service.invalidate()
    return {"key": key, "enabled": body["enabled"]}


@router.get("/fair-use")
async def read_fair_use(_: AdminUser) -> list[dict[str, Any]]:
    current = get_fair_use().model_dump()
    return [{"key": key, "value": current[key]} for key in EDITABLE_KEYS]


@router.put("/fair-use")
async def write_fair_use(
    body: dict[str, int], container: ContainerDep, session: SessionDep, _: AdminUser
) -> list[dict[str, Any]]:
    unknown = [key for key in body if key not in EDITABLE_KEYS]
    if unknown or any(value <= 0 for value in body.values()):
        raise ToolInputError("Fair-use values must be positive numbers from the editable list.")
    row = await session.get(SiteSetting, FAIR_USE_KEY)
    merged = {**(row.value if row else {}), **body}
    if row is None:
        session.add(SiteSetting(key=FAIR_USE_KEY, value=merged))
    else:
        row.value = merged
    await session.commit()
    await load_fair_use(container.database)
    return await read_fair_use(_)


@router.get("/announcement")
async def read_announcement(session: SessionDep, _: AdminUser) -> dict[str, Any]:
    row = await session.get(SiteSetting, ANNOUNCEMENT_KEY)
    return row.value if row else AnnouncementBody().model_dump()


@router.put("/announcement")
async def write_announcement(body: AnnouncementBody, session: SessionDep, _: AdminUser) -> dict[str, Any]:
    if body.href and not body.href.startswith(("https://", "http://", "/")):
        raise ToolInputError("The link must start with https:// or /.")
    value = {**body.model_dump(), "version": int(time.time())}
    row = await session.get(SiteSetting, ANNOUNCEMENT_KEY)
    if row is None:
        session.add(SiteSetting(key=ANNOUNCEMENT_KEY, value=value))
    else:
        row.value = value
    await session.commit()
    return value


@router.get("/abuse")
async def abuse_queue(session: SessionDep, _: AdminUser, status: str = "open") -> list[dict[str, Any]]:
    rows = await session.scalars(
        select(AbuseReport)
        .where(AbuseReport.status == status)
        .order_by(AbuseReport.created_at.desc())
        .limit(200)
    )
    return [
        {
            "id": row.id,
            "kind": row.kind,
            "target": row.target,
            "reason": row.reason,
            "status": row.status,
            "created_at": row.created_at.isoformat(),
            "note": row.resolution_note,
            "reported_by_user": row.reporter_user_id is not None,
        }
        for row in rows
    ]


@router.post("/abuse/{report_id}/resolve")
async def resolve_report(
    report_id: str, body: ResolveIn, session: SessionDep, admin: AdminUser
) -> dict[str, str]:
    report = await session.get(AbuseReport, report_id)
    if report is None:
        raise NotFoundError("That report was not found.")
    if body.deactivate_user_id:
        user = await session.get(User, body.deactivate_user_id)
        if user is not None and user.id != admin.id:
            user.is_active = False
    report.status = body.status
    report.resolution_note = body.note.strip()
    await session.commit()
    return {"status": report.status}


@public.get("/flags")
async def public_flags(session: SessionDep) -> dict[str, bool]:
    return await flag_service.all_flags(session)


@public.get("/announcement")
async def public_announcement(session: SessionDep) -> dict[str, Any]:
    row = await session.get(SiteSetting, ANNOUNCEMENT_KEY)
    value = row.value if row else {}
    if not value.get("enabled"):
        return {"enabled": False}
    return {
        "enabled": True,
        "message": {"en": value.get("message_en", ""), "ur": value.get("message_ur", "")},
        "href": value.get("href", ""),
        "version": value.get("version", 0),
    }


@public.post("/reports", status_code=202)
async def submit_report(
    body: ReportIn, request: Request, container: ContainerDep, session: SessionDep, user: OptionalUser
) -> dict[str, str]:
    await limit_by_ip(request, container, "abuse-report", limit=10, window=3600)
    session.add(
        AbuseReport(
            kind=body.kind,
            target=body.target.strip(),
            reason=body.reason.strip(),
            reporter_user_id=user.id if user else None,
            reporter_ip_hash=client_ip_hash(request),
        )
    )
    await session.commit()
    return {"message": "Thanks. A person will review this report."}
