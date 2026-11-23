import secrets
from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.api.deps import ContainerDep, CurrentUser, SessionDep, limit_by_user
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ToolInputError
from app.core.security import hash_token
from app.db.base import utcnow
from app.models.team import Team, TeamInvite, TeamMember, TeamRole, TeamWorkflow
from app.models.user import User
from app.services.email import action_email
from app.services.flags import require_flag
from app.services.permissions import (
    Permission,
    can_assign_role,
    require_team,
    role_allows,
)
from app.tools.organize.workflow import WorkflowEdge, WorkflowNode

router = APIRouter(prefix="/api/v1/teams", tags=["teams"])

MAX_TEAMS_PER_USER = 20
MAX_MEMBERS = 50
MAX_WORKFLOWS = 100
INVITE_DAYS = 7
AssignableRole = Literal["admin", "member", "viewer"]


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class TeamSummary(BaseModel):
    id: str
    name: str
    role: str
    member_count: int


class MemberOut(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str


class InviteOut(BaseModel):
    id: str
    email: str
    role: str
    expires_at: str


class WorkflowOut(BaseModel):
    id: str
    name: str
    graph: dict[str, Any]
    created_by: str
    updated_at: str


class TeamDetail(TeamSummary):
    members: list[MemberOut]
    invites: list[InviteOut]
    permissions: list[str]


class InviteCreate(BaseModel):
    email: EmailStr
    role: AssignableRole = "member"


class RoleUpdate(BaseModel):
    role: AssignableRole


class AcceptInvite(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class WorkflowSave(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    nodes: list[WorkflowNode] = Field(min_length=1, max_length=12)
    edges: list[WorkflowEdge] = Field(default_factory=list, max_length=48)


def summary(team: Team, role: str) -> TeamSummary:
    return TeamSummary(id=team.id, name=team.name, role=role, member_count=len(team.members))


async def detail(session: SessionDep, team: Team, member: TeamMember) -> TeamDetail:
    users = {
        row.id: row
        for row in await session.scalars(select(User).where(User.id.in_([m.user_id for m in team.members])))
    }
    invites: list[InviteOut] = []
    if role_allows(member.role, Permission.MEMBERS_INVITE):
        rows = await session.scalars(
            select(TeamInvite).where(TeamInvite.team_id == team.id, TeamInvite.accepted_at.is_(None))
        )
        invites = [
            InviteOut(id=row.id, email=row.email, role=row.role, expires_at=row.expires_at.isoformat())
            for row in rows
            if row.expires_at > utcnow()
        ]
    from app.services.permissions import ROLE_PERMISSIONS

    return TeamDetail(
        **summary(team, member.role).model_dump(),
        members=[
            MemberOut(
                user_id=m.user_id,
                email=users[m.user_id].email if m.user_id in users else "",
                display_name=users[m.user_id].display_name if m.user_id in users else "",
                role=m.role,
            )
            for m in sorted(team.members, key=lambda entry: entry.created_at)
        ],
        invites=invites,
        permissions=sorted(p.value for p in ROLE_PERMISSIONS[TeamRole(member.role)]),
    )


@router.post("", response_model=TeamSummary, status_code=201)
async def create_team(body: TeamCreate, session: SessionDep, user: CurrentUser) -> TeamSummary:
    await require_flag(session, "teams")
    count = len(list(await session.scalars(select(TeamMember).where(TeamMember.user_id == user.id))))
    if count >= MAX_TEAMS_PER_USER:
        raise ConflictError("You are already in the maximum number of teams.")
    team = Team(name=body.name.strip(), owner_id=user.id)
    session.add(team)
    await session.flush()
    session.add(TeamMember(team_id=team.id, user_id=user.id, role=TeamRole.OWNER.value))
    await session.commit()
    await session.refresh(team)
    return summary(team, TeamRole.OWNER.value)


@router.get("", response_model=list[TeamSummary])
async def my_teams(session: SessionDep, user: CurrentUser) -> list[TeamSummary]:
    memberships = list(await session.scalars(select(TeamMember).where(TeamMember.user_id == user.id)))
    result: list[TeamSummary] = []
    for membership in memberships:
        team = await session.get(Team, membership.team_id)
        if team is not None:
            result.append(summary(team, membership.role))
    return sorted(result, key=lambda entry: entry.name.lower())


@router.post("/invites/accept", response_model=TeamSummary)
async def accept_invite(body: AcceptInvite, session: SessionDep, user: CurrentUser) -> TeamSummary:
    invite = await session.scalar(select(TeamInvite).where(TeamInvite.token_hash == hash_token(body.token)))
    if invite is None or invite.accepted_at is not None or invite.expires_at <= utcnow():
        raise NotFoundError("This invitation is not valid or has expired.")
    if invite.email.lower() != user.email.lower():
        raise PermissionDeniedError(
            "This invitation was sent to a different email address.",
            hint="Sign in with the address that received it.",
        )
    team = await session.get(Team, invite.team_id)
    if team is None:
        raise NotFoundError("This team no longer exists.")
    existing = await session.scalar(
        select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.user_id == user.id)
    )
    if existing is None:
        if len(team.members) >= MAX_MEMBERS:
            raise ConflictError("This team is full.")
        session.add(TeamMember(team_id=team.id, user_id=user.id, role=invite.role))
    invite.accepted_at = utcnow()
    await session.commit()
    await session.refresh(team)
    role = existing.role if existing else invite.role
    return summary(team, role)


@router.get("/{team_id}", response_model=TeamDetail)
async def get_team(team_id: str, session: SessionDep, user: CurrentUser) -> TeamDetail:
    team, member = await require_team(session, user, team_id, Permission.TEAM_VIEW)
    return await detail(session, team, member)


@router.patch("/{team_id}", response_model=TeamSummary)
async def rename_team(team_id: str, body: TeamCreate, session: SessionDep, user: CurrentUser) -> TeamSummary:
    team, member = await require_team(session, user, team_id, Permission.TEAM_RENAME)
    team.name = body.name.strip()
    await session.commit()
    return summary(team, member.role)


@router.delete("/{team_id}", status_code=204)
async def delete_team(
    team_id: str, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> Response:
    team, _ = await require_team(session, user, team_id, Permission.TEAM_DELETE)
    from app.models.library import LibraryFile

    files = list(await session.scalars(select(LibraryFile).where(LibraryFile.team_id == team.id)))
    for record in files:
        container.storage.delete(record.storage_key)
    await session.delete(team)
    await session.commit()
    return Response(status_code=204)


@router.post("/{team_id}/invites", response_model=InviteOut, status_code=201)
async def invite(
    team_id: str, body: InviteCreate, container: ContainerDep, session: SessionDep, user: CurrentUser
) -> InviteOut:
    await limit_by_user(container, user, "team-invite", limit=30, window=3600)
    team, member = await require_team(session, user, team_id, Permission.MEMBERS_INVITE)
    if not can_assign_role(member.role, body.role):
        raise PermissionDeniedError("Only the team owner can invite admins.")
    if len(team.members) >= MAX_MEMBERS:
        raise ConflictError("This team is full.")
    email = str(body.email).lower()
    raw = secrets.token_urlsafe(32)
    record = TeamInvite(
        team_id=team.id,
        email=email,
        role=body.role,
        token_hash=hash_token(raw),
        invited_by=user.id,
        expires_at=utcnow() + timedelta(days=INVITE_DAYS),
    )
    session.add(record)
    await session.commit()
    link = f"{container.settings.public_web_url.rstrip('/')}/en/teams/accept/{raw}"
    await container.email_sender.send(
        action_email(
            email,
            f"You are invited to join {team.name}",
            f"{user.display_name or user.email} invited you to join “{team.name}” as {body.role}.",
            "Accept the invitation",
            link,
            f"The link works until {record.expires_at:%Y-%m-%d} and only for this email address.",
        )
    )
    return InviteOut(id=record.id, email=email, role=body.role, expires_at=record.expires_at.isoformat())


@router.delete("/{team_id}/invites/{invite_id}", status_code=204)
async def revoke_invite(team_id: str, invite_id: str, session: SessionDep, user: CurrentUser) -> Response:
    await require_team(session, user, team_id, Permission.MEMBERS_INVITE)
    record = await session.get(TeamInvite, invite_id)
    if record is None or record.team_id != team_id:
        raise NotFoundError("That invitation was not found.")
    await session.delete(record)
    await session.commit()
    return Response(status_code=204)


@router.patch("/{team_id}/members/{member_user_id}", response_model=MemberOut)
async def change_role(
    team_id: str, member_user_id: str, body: RoleUpdate, session: SessionDep, user: CurrentUser
) -> MemberOut:
    _, actor = await require_team(session, user, team_id, Permission.MEMBERS_MANAGE)
    target = await session.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == member_user_id)
    )
    if target is None:
        raise NotFoundError("That member was not found.")
    if not can_assign_role(actor.role, body.role, target.role):
        raise PermissionDeniedError("You cannot change this member's role.")
    target.role = body.role
    await session.commit()
    person = await session.get(User, member_user_id)
    return MemberOut(
        user_id=member_user_id,
        email=person.email if person else "",
        display_name=person.display_name if person else "",
        role=target.role,
    )


@router.delete("/{team_id}/members/{member_user_id}", status_code=204)
async def remove_member(
    team_id: str, member_user_id: str, session: SessionDep, user: CurrentUser
) -> Response:
    team, actor = await require_team(session, user, team_id, Permission.TEAM_VIEW)
    target = await session.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == member_user_id)
    )
    if target is None:
        raise NotFoundError("That member was not found.")
    leaving = member_user_id == user.id
    if target.role == TeamRole.OWNER.value:
        raise ConflictError("The owner cannot leave. Delete the team or transfer ownership first.")
    if not leaving and not can_assign_role(actor.role, TeamRole.VIEWER.value, target.role):
        raise PermissionDeniedError("You cannot remove this member.")
    await session.delete(target)
    await session.commit()
    del team
    return Response(status_code=204)


def workflow_out(record: TeamWorkflow) -> WorkflowOut:
    return WorkflowOut(
        id=record.id,
        name=record.name,
        graph=record.graph,
        created_by=record.created_by,
        updated_at=record.updated_at.isoformat(),
    )


@router.get("/{team_id}/workflows", response_model=list[WorkflowOut])
async def list_workflows(team_id: str, session: SessionDep, user: CurrentUser) -> list[WorkflowOut]:
    await require_team(session, user, team_id, Permission.WORKFLOWS_READ)
    rows = await session.scalars(
        select(TeamWorkflow).where(TeamWorkflow.team_id == team_id).order_by(TeamWorkflow.name)
    )
    return [workflow_out(row) for row in rows]


@router.post("/{team_id}/workflows", response_model=WorkflowOut, status_code=201)
async def save_workflow(
    team_id: str, body: WorkflowSave, session: SessionDep, user: CurrentUser
) -> WorkflowOut:
    await require_team(session, user, team_id, Permission.WORKFLOWS_WRITE)
    from app.tools.organize.workflow import graph_order

    try:
        graph_order(body.nodes, body.edges)
    except ValueError as exc:
        raise ToolInputError(str(exc)) from exc
    existing = list(await session.scalars(select(TeamWorkflow).where(TeamWorkflow.team_id == team_id)))
    graph = {
        "nodes": [node.model_dump() for node in body.nodes],
        "edges": [edge.model_dump() for edge in body.edges],
    }
    for record in existing:
        if record.name == body.name.strip():
            record.graph = graph
            await session.commit()
            return workflow_out(record)
    if len(existing) >= MAX_WORKFLOWS:
        raise ConflictError("This team has reached the workflow limit.")
    record = TeamWorkflow(team_id=team_id, name=body.name.strip(), graph=graph, created_by=user.id)
    session.add(record)
    await session.commit()
    return workflow_out(record)


@router.delete("/{team_id}/workflows/{workflow_id}", status_code=204)
async def delete_workflow(team_id: str, workflow_id: str, session: SessionDep, user: CurrentUser) -> Response:
    await require_team(session, user, team_id, Permission.WORKFLOWS_WRITE)
    record = await session.get(TeamWorkflow, workflow_id)
    if record is None or record.team_id != team_id:
        raise NotFoundError("That workflow was not found.")
    await session.delete(record)
    await session.commit()
    return Response(status_code=204)
