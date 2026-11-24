from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse

from app.api.deps import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    ContainerDep,
    CurrentUser,
    SessionDep,
    SettingsDep,
    limit_by_ip,
    set_cookie,
)
from app.core.config import Settings
from app.core.errors import AppError, AuthenticationError
from app.core.security import constant_time_equals, decode_jwt, encode_jwt
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    EmailRequest,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    MfaCodeRequest,
    MfaDisableRequest,
    MfaLoginRequest,
    MfaSetupResponse,
    RecoveryCodesResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenRequest,
    UserResponse,
)
from app.services.auth import AuthService, SessionTokens
from app.services.flags import require_flag
from app.services.oauth import build_authorization, exchange_code, resolve_oauth_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
REFRESH_PATH = "/api/v1/auth"
OAUTH_COOKIE = "pn_oauth"
OAUTH_COOKIE_TTL = 600


def get_auth_service(session: SessionDep, container: ContainerDep) -> AuthService:
    return AuthService(session, container.settings, container.email_sender)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


async def auth_attempt_limit(request: Request, container: ContainerDep) -> None:
    await limit_by_ip(request, container, "auth", limit=20, window=60)


async def email_send_limit(request: Request, container: ContainerDep) -> None:
    await limit_by_ip(request, container, "auth-email", limit=5, window=300)


def _set_session_cookies(response: Response, settings: Settings, tokens: SessionTokens) -> None:
    set_cookie(response, settings, ACCESS_COOKIE, tokens.access_token, settings.access_token_ttl_seconds)
    set_cookie(
        response,
        settings,
        REFRESH_COOKIE,
        tokens.refresh_token,
        settings.refresh_token_ttl_seconds,
        path=REFRESH_PATH,
    )


def _clear_session_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=settings.cookie_domain)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH, domain=settings.cookie_domain)


async def complete_login(
    service: AuthService,
    session: SessionDep,
    user: User,
    request: Request,
    response: Response,
    settings: Settings,
) -> LoginResponse:
    tokens = await service.issue_session(user, request.headers.get("user-agent", ""))
    await session.commit()
    _set_session_cookies(response, settings, tokens)
    return LoginResponse(user=UserResponse.from_user(user))


@router.post(
    "/register", response_model=LoginResponse, status_code=201, dependencies=[Depends(auth_attempt_limit)]
)
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    service: AuthServiceDep,
    session: SessionDep,
    settings: SettingsDep,
) -> LoginResponse:
    await require_flag(session, "signups")
    user = await service.register(body.email, body.password, body.display_name)
    return await complete_login(service, session, user, request, response, settings)


@router.post("/login", response_model=LoginResponse, dependencies=[Depends(auth_attempt_limit)])
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    service: AuthServiceDep,
    session: SessionDep,
    settings: SettingsDep,
) -> LoginResponse:
    user = await service.authenticate(body.email, body.password)
    if user.totp_enabled:
        await session.commit()
        return LoginResponse(mfa_required=True, mfa_token=service.issue_mfa_challenge(user))
    return await complete_login(service, session, user, request, response, settings)


@router.post("/mfa/login", response_model=LoginResponse, dependencies=[Depends(auth_attempt_limit)])
async def mfa_login(
    body: MfaLoginRequest,
    request: Request,
    response: Response,
    service: AuthServiceDep,
    session: SessionDep,
    settings: SettingsDep,
) -> LoginResponse:
    decoded = decode_jwt(body.mfa_token, "mfa")
    if decoded is None:
        raise AuthenticationError("Your sign-in attempt expired.", hint="Sign in again.")
    user = await session.get(User, decoded.subject)
    if user is None or not user.is_active or not await service.verify_second_factor(user, body.code):
        raise AuthenticationError(
            "That code is not correct.", hint="Use the current code from your authenticator app."
        )
    return await complete_login(service, session, user, request, response, settings)


@router.post("/refresh", response_model=LoginResponse)
async def refresh(
    request: Request, response: Response, service: AuthServiceDep, session: SessionDep, settings: SettingsDep
) -> LoginResponse:
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise AuthenticationError("Your session has ended.", hint="Please sign in again.")
    try:
        user, tokens = await service.rotate_refresh(raw, request.headers.get("user-agent", ""))
    except AuthenticationError:
        _clear_session_cookies(response, settings)
        raise
    await session.commit()
    _set_session_cookies(response, settings, tokens)
    return LoginResponse(user=UserResponse.from_user(user))


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request, response: Response, service: AuthServiceDep, session: SessionDep, settings: SettingsDep
) -> MessageResponse:
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        await service.revoke_refresh(raw)
        await session.commit()
    _clear_session_cookies(response, settings)
    return MessageResponse(message="Signed out.")


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserResponse:
    return UserResponse.from_user(user)


@router.get("/sessions")
async def list_sessions(
    request: Request, user: CurrentUser, service: AuthServiceDep
) -> list[dict[str, object]]:
    return await service.list_sessions(user, request.cookies.get(REFRESH_COOKIE))


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_session(
    session_id: str, user: CurrentUser, service: AuthServiceDep, session: SessionDep
) -> Response:
    await service.revoke_session(user, session_id)
    await session.commit()
    return Response(status_code=204)


@router.get("/providers")
async def providers(settings: SettingsDep) -> dict[str, list[str]]:
    configured = [
        name
        for name, client_id, secret in (
            ("google", settings.google_client_id, settings.google_client_secret),
            ("github", settings.github_client_id, settings.github_client_secret),
        )
        if client_id and secret
    ]
    return {"providers": configured}


@router.get("/csrf", response_model=MessageResponse)
async def csrf() -> MessageResponse:
    return MessageResponse(message="ok")


@router.post("/verify-email", response_model=UserResponse)
async def verify_email(body: TokenRequest, service: AuthServiceDep, session: SessionDep) -> UserResponse:
    user = await service.verify_email(body.token)
    await session.commit()
    return UserResponse.from_user(user)


@router.post("/verify-email/resend", response_model=MessageResponse, dependencies=[Depends(email_send_limit)])
async def resend_verification(
    user: CurrentUser, service: AuthServiceDep, session: SessionDep
) -> MessageResponse:
    await service.send_verification_email(user)
    await session.commit()
    return MessageResponse(message="If your email is not yet confirmed, a new link is on its way.")


@router.post(
    "/password/forgot",
    response_model=MessageResponse,
    status_code=202,
    dependencies=[Depends(email_send_limit)],
)
async def forgot_password(
    body: EmailRequest, service: AuthServiceDep, session: SessionDep
) -> MessageResponse:
    await service.request_password_reset(body.email)
    await session.commit()
    return MessageResponse(message="If an account exists for that email, a reset link is on its way.")


@router.post("/password/reset", response_model=MessageResponse, dependencies=[Depends(auth_attempt_limit)])
async def reset_password(
    body: ResetPasswordRequest,
    response: Response,
    service: AuthServiceDep,
    session: SessionDep,
    settings: SettingsDep,
) -> MessageResponse:
    await service.reset_password(body.token, body.password)
    await session.commit()
    _clear_session_cookies(response, settings)
    return MessageResponse(message="Your password was changed. Sign in with your new password.")


@router.post("/password/change", response_model=LoginResponse)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    response: Response,
    user: CurrentUser,
    service: AuthServiceDep,
    session: SessionDep,
    settings: SettingsDep,
) -> LoginResponse:
    await service.change_password(user, body.current_password, body.new_password)
    return await complete_login(service, session, user, request, response, settings)


@router.post("/mfa/setup", response_model=MfaSetupResponse)
async def mfa_setup(user: CurrentUser, service: AuthServiceDep, session: SessionDep) -> MfaSetupResponse:
    secret, uri = service.begin_mfa_setup(user)
    await session.commit()
    return MfaSetupResponse(secret=secret, otpauth_uri=uri)


@router.post("/mfa/enable", response_model=RecoveryCodesResponse, dependencies=[Depends(auth_attempt_limit)])
async def mfa_enable(
    body: MfaCodeRequest, user: CurrentUser, service: AuthServiceDep, session: SessionDep
) -> RecoveryCodesResponse:
    codes = await service.enable_mfa(user, body.code)
    await session.commit()
    return RecoveryCodesResponse(recovery_codes=codes)


@router.post("/mfa/disable", response_model=UserResponse, dependencies=[Depends(auth_attempt_limit)])
async def mfa_disable(
    body: MfaDisableRequest, user: CurrentUser, service: AuthServiceDep, session: SessionDep
) -> UserResponse:
    await service.disable_mfa(user, body.password, body.code)
    await session.commit()
    return UserResponse.from_user(user)


@router.get("/oauth/{provider}/start")
async def oauth_start(provider: str, settings: SettingsDep) -> RedirectResponse:
    start = build_authorization(settings, provider)
    response = RedirectResponse(start.url, status_code=302)
    state_cookie = encode_jwt(
        provider, "oauth_state", OAUTH_COOKIE_TTL, {"state": start.state, "verifier": start.verifier}
    )
    set_cookie(response, settings, OAUTH_COOKIE, state_cookie, OAUTH_COOKIE_TTL, path="/api/v1/auth/oauth")
    return response


@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: str,
    request: Request,
    service: AuthServiceDep,
    session: SessionDep,
    settings: SettingsDep,
    code: str = "",
    state: str = "",
) -> RedirectResponse:
    web = settings.public_web_url.rstrip("/")
    failure = RedirectResponse(f"{web}/auth/login?error=oauth", status_code=302)
    failure.delete_cookie(OAUTH_COOKIE, path="/api/v1/auth/oauth", domain=settings.cookie_domain)
    cookie = request.cookies.get(OAUTH_COOKIE, "")
    decoded = decode_jwt(cookie, "oauth_state") if cookie else None
    if (
        decoded is None
        or decoded.subject != provider
        or not code
        or not state
        or not constant_time_equals(str(decoded.claims.get("state", "")), state)
    ):
        return failure
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            profile = await exchange_code(
                settings, provider, code, str(decoded.claims.get("verifier", "")), client
            )
        user = await resolve_oauth_user(session, provider, profile)
    except (AppError, httpx.HTTPError, KeyError, ValueError):
        return failure
    if user.totp_enabled:
        await session.commit()
        challenge = service.issue_mfa_challenge(user)
        response = RedirectResponse(f"{web}/auth/mfa#token={challenge}", status_code=302)
    else:
        tokens = await service.issue_session(user, request.headers.get("user-agent", ""))
        await session.commit()
        response = RedirectResponse(f"{web}/", status_code=302)
        _set_session_cookies(response, settings, tokens)
    response.delete_cookie(OAUTH_COOKIE, path="/api/v1/auth/oauth", domain=settings.cookie_domain)
    return response
