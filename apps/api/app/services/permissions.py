from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, PermissionDeniedError
from app.models.team import Team, TeamMember, TeamRole
from app.models.user import User


class Permission(StrEnum):
    TEAM_VIEW = "team.view"
    TEAM_RENAME = "team.rename"
    TEAM_DELETE = "team.delete"
    MEMBERS_INVITE = "members.invite"
    MEMBERS_MANAGE = "members.manage"
    MEMBERS_PROMOTE_ADMIN = "members.promote_admin"
    FILES_READ = "files.read"
    FILES_WRITE = "files.write"
    FILES_DELETE = "files.delete"
    FOLDERS_MANAGE = "folders.manage"
    WORKFLOWS_READ = "workflows.read"
    WORKFLOWS_WRITE = "workflows.write"


_VIEWER = {Permission.TEAM_VIEW, Permission.FILES_READ, Permission.WORKFLOWS_READ}
_MEMBER = _VIEWER | {Permission.FILES_WRITE, Permission.WORKFLOWS_WRITE, Permission.FOLDERS_MANAGE}
_ADMIN = _MEMBER | {
    Permission.TEAM_RENAME,
    Permission.MEMBERS_INVITE,
    Permission.MEMBERS_MANAGE,
    Permission.FILES_DELETE,
}
_OWNER = _ADMIN | {Permission.TEAM_DELETE, Permission.MEMBERS_PROMOTE_ADMIN}

ROLE_PERMISSIONS: dict[TeamRole, frozenset[Permission]] = {
    TeamRole.VIEWER: frozenset(_VIEWER),
    TeamRole.MEMBER: frozenset(_MEMBER),
    TeamRole.ADMIN: frozenset(_ADMIN),
    TeamRole.OWNER: frozenset(_OWNER),
}
ROLE_RANK = {TeamRole.VIEWER: 0, TeamRole.MEMBER: 1, TeamRole.ADMIN: 2, TeamRole.OWNER: 3}


def role_allows(role: str, permission: Permission) -> bool:
    try:
        return permission in ROLE_PERMISSIONS[TeamRole(role)]
    except ValueError:
        return False


async def membership(session: AsyncSession, user: User, team_id: str) -> TeamMember | None:
    found: TeamMember | None = await session.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
    )
    return found


async def require_team(
    session: AsyncSession, user: User, team_id: str, permission: Permission
) -> tuple[Team, TeamMember]:
    member = await membership(session, user, team_id)
    team = await session.get(Team, team_id)
    if member is None or team is None:
        raise NotFoundError("That team was not found.")
    if not role_allows(member.role, permission):
        raise PermissionDeniedError(
            "You do not have permission to do that in this team.",
            hint="Ask a team admin to change your role.",
        )
    return team, member


def can_assign_role(actor_role: str, new_role: str, target_role: str | None = None) -> bool:
    actor = TeamRole(actor_role)
    desired = TeamRole(new_role)
    if desired is TeamRole.OWNER:
        return False
    if desired is TeamRole.ADMIN and not role_allows(actor_role, Permission.MEMBERS_PROMOTE_ADMIN):
        return False
    if target_role is not None:
        target = TeamRole(target_role)
        if target is TeamRole.OWNER:
            return False
        if actor is not TeamRole.OWNER and ROLE_RANK[target] >= ROLE_RANK[actor]:
            return False
    return role_allows(actor_role, Permission.MEMBERS_MANAGE)
