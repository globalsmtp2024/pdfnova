import base64
import hashlib
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, NotFoundError
from app.core.security import generate_token
from app.db.base import utcnow
from app.models.user import OAuthAccount, RefreshToken, User
from app.services.auth import normalize_email


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    authorize_url: str
    token_url: str
    scope: str
    uses_pkce: bool


@dataclass(frozen=True)
class OAuthProfile:
    provider_user_id: str
    email: str
    email_verified: bool
    display_name: str


PROVIDERS = {
    "google": ProviderConfig(
        name="google",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        scope="openid email profile",
        uses_pkce=True,
    ),
    "github": ProviderConfig(
        name="github",
        authorize_url="https://github.com/login/oauth/authorize",
        token_url="https://github.com/login/oauth/access_token",
        scope="read:user user:email",
        uses_pkce=False,
    ),
}


class OAuthError(AppError):
    code = "oauth_failed"


def _credentials(settings: Settings, provider: str) -> tuple[str, str]:
    if provider == "google" and settings.google_client_id and settings.google_client_secret:
        return settings.google_client_id, settings.google_client_secret.get_secret_value()
    if provider == "github" and settings.github_client_id and settings.github_client_secret:
        return settings.github_client_id, settings.github_client_secret.get_secret_value()
    raise NotFoundError(f"Sign-in with {provider} is not available.")


def get_provider(name: str) -> ProviderConfig:
    provider = PROVIDERS.get(name)
    if provider is None:
        raise NotFoundError(f"Unknown sign-in provider '{name}'.")
    return provider


def redirect_uri(settings: Settings, provider: str) -> str:
    return f"{settings.public_api_url.rstrip('/')}/api/v1/auth/oauth/{provider}/callback"


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


@dataclass(frozen=True)
class AuthorizationStart:
    url: str
    state: str
    verifier: str


def build_authorization(settings: Settings, provider_name: str) -> AuthorizationStart:
    provider = get_provider(provider_name)
    client_id, _ = _credentials(settings, provider_name)
    state = generate_token(24)
    verifier = generate_token(48)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri(settings, provider_name),
        "response_type": "code",
        "scope": provider.scope,
        "state": state,
    }
    if provider.uses_pkce:
        params |= {
            "code_challenge": pkce_challenge(verifier),
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
    return AuthorizationStart(
        url=f"{provider.authorize_url}?{urlencode(params)}", state=state, verifier=verifier
    )


async def exchange_code(
    settings: Settings, provider_name: str, code: str, verifier: str, client: httpx.AsyncClient
) -> OAuthProfile:
    provider = get_provider(provider_name)
    client_id, client_secret = _credentials(settings, provider_name)
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri(settings, provider_name),
        "grant_type": "authorization_code",
    }
    if provider.uses_pkce:
        data["code_verifier"] = verifier
    token_response = await client.post(provider.token_url, data=data, headers={"Accept": "application/json"})
    if token_response.status_code != 200:
        raise OAuthError("The sign-in provider rejected the request.", hint="Please try again.")
    access_token = token_response.json().get("access_token")
    if not access_token:
        raise OAuthError("The sign-in provider did not return a token.", hint="Please try again.")
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    if provider_name == "google":
        info = (await client.get("https://openidconnect.googleapis.com/v1/userinfo", headers=headers)).json()
        return OAuthProfile(
            provider_user_id=str(info["sub"]),
            email=normalize_email(info.get("email", "")),
            email_verified=bool(info.get("email_verified")),
            display_name=str(info.get("name") or ""),
        )
    user_info = (await client.get("https://api.github.com/user", headers=headers)).json()
    emails = (await client.get("https://api.github.com/user/emails", headers=headers)).json()
    primary = next((e for e in emails if e.get("primary") and e.get("verified")), None)
    return OAuthProfile(
        provider_user_id=str(user_info["id"]),
        email=normalize_email(primary["email"]) if primary else "",
        email_verified=primary is not None,
        display_name=str(user_info.get("name") or user_info.get("login") or ""),
    )


async def resolve_oauth_user(session: AsyncSession, provider: str, profile: OAuthProfile) -> User:
    account = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider, OAuthAccount.provider_user_id == profile.provider_user_id
        )
    )
    if account is not None:
        user = await session.get(User, account.user_id)
        if user is None or not user.is_active:
            raise OAuthError("This account is disabled.")
        return user
    if not profile.email or not profile.email_verified:
        raise OAuthError(
            "Your provider account has no verified email address.",
            hint="Verify your email with the provider, or sign up with email and password.",
        )
    user = await session.scalar(select(User).where(User.email == profile.email))
    if user is None:
        user = User(email=profile.email, display_name=profile.display_name[:120], email_verified_at=utcnow())
        session.add(user)
        await session.flush()
    elif user.email_verified_at is None:
        user.email_verified_at = utcnow()
        user.password_hash = None
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
    session.add(
        OAuthAccount(
            user_id=user.id,
            provider=provider,
            provider_user_id=profile.provider_user_id,
            provider_email=profile.email,
        )
    )
    await session.flush()
    return user
