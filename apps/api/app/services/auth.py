import secrets
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import urlencode

import pyotp
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.brand import get_brand
from app.core.config import Settings
from app.core.crypto import load_key, open_text, seal_text
from app.core.errors import AppError, AuthenticationError, ConflictError
from app.core.security import (
    encode_jwt,
    generate_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    verify_password,
)
from app.db.base import new_id, utcnow
from app.models.user import OneTimeToken, RecoveryCode, RefreshToken, User
from app.services.email import EmailSender, action_email

MAX_FAILED_LOGINS = 10
LOCKOUT_MINUTES = 15
MFA_TOKEN_TTL_SECONDS = 300
RECOVERY_CODE_COUNT = 10
PURPOSE_VERIFY_EMAIL = "verify_email"
PURPOSE_RESET_PASSWORD = "reset_password"


class WeakPasswordError(AppError):
    status_code = 422
    code = "weak_password"


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    refresh_token: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


def check_password_strength(password: str, email: str) -> None:
    if len(password) < 10:
        raise WeakPasswordError(
            "Use at least 10 characters.", hint="Longer passphrases are easier to remember."
        )
    if len(password) > 128:
        raise WeakPasswordError("Use at most 128 characters.")
    if len(set(password)) < 5:
        raise WeakPasswordError("This password is too repetitive.", hint="Mix different words or characters.")
    if normalize_email(email).split("@")[0] in password.lower():
        raise WeakPasswordError("Do not include your email name in the password.")


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings, email_sender: EmailSender):
        self._session = session
        self._settings = settings
        self._email = email_sender
        self._key = load_key(settings.storage_encryption_key.get_secret_value())

    async def get_user_by_email(self, email: str) -> User | None:
        user: User | None = await self._session.scalar(
            select(User).where(User.email == normalize_email(email))
        )
        return user

    async def register(self, email: str, password: str, display_name: str) -> User:
        normalized = normalize_email(email)
        check_password_strength(password, normalized)
        if await self.get_user_by_email(normalized) is not None:
            raise ConflictError(
                "An account with this email already exists.", hint="Sign in instead, or reset your password."
            )
        user = User(
            email=normalized, display_name=display_name.strip()[:120], password_hash=hash_password(password)
        )
        self._session.add(user)
        await self._session.flush()
        await self.send_verification_email(user)
        return user

    async def authenticate(self, email: str, password: str) -> User:
        user = await self.get_user_by_email(email)
        now = utcnow()
        if user is not None and user.locked_until is not None and user.locked_until > now:
            raise AuthenticationError(
                "Too many failed sign-in attempts.", hint="Wait 15 minutes or reset your password."
            )
        if user is None or not user.is_active or not verify_password(password, user.password_hash):
            if user is not None:
                user.failed_login_count += 1
                if user.failed_login_count >= MAX_FAILED_LOGINS:
                    user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
                    user.failed_login_count = 0
                await self._session.commit()
            raise AuthenticationError(
                "Email or password is incorrect.", hint="Check for typos or reset your password."
            )
        if user.password_hash and password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
        user.failed_login_count = 0
        user.locked_until = None
        return user

    async def issue_session(self, user: User, user_agent: str, family_id: str | None = None) -> SessionTokens:
        raw_refresh = generate_token(48)
        self._session.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_token(raw_refresh),
                family_id=family_id or new_id(),
                expires_at=utcnow() + timedelta(seconds=self._settings.refresh_token_ttl_seconds),
                user_agent=user_agent[:255],
            )
        )
        user.last_login_at = utcnow()
        await self._session.flush()
        access = encode_jwt(user.id, "access", self._settings.access_token_ttl_seconds)
        return SessionTokens(access_token=access, refresh_token=raw_refresh)

    async def rotate_refresh(self, raw_refresh: str, user_agent: str) -> tuple[User, SessionTokens]:
        record = await self._session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_refresh))
        )
        if record is None:
            raise AuthenticationError("Your session has ended.", hint="Please sign in again.")
        if record.revoked_at is not None:
            await self._revoke_family(record.family_id)
            await self._session.commit()
            raise AuthenticationError("Your session has ended.", hint="Please sign in again.")
        if record.expires_at <= utcnow():
            raise AuthenticationError("Your session has expired.", hint="Please sign in again.")
        user = await self._session.get(User, record.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Your session has ended.", hint="Please sign in again.")
        record.revoked_at = utcnow()
        tokens = await self.issue_session(user, user_agent, family_id=record.family_id)
        return user, tokens

    async def revoke_refresh(self, raw_refresh: str) -> None:
        record = await self._session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_refresh))
        )
        if record is not None:
            await self._revoke_family(record.family_id)

    async def revoke_all_sessions(self, user_id: str) -> None:
        await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )

    async def _revoke_family(self, family_id: str) -> None:
        await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )

    async def _create_one_time_token(self, user: User, purpose: str, ttl_seconds: int) -> str:
        await self._session.execute(
            update(OneTimeToken)
            .where(
                OneTimeToken.user_id == user.id,
                OneTimeToken.purpose == purpose,
                OneTimeToken.used_at.is_(None),
            )
            .values(used_at=utcnow())
        )
        raw = generate_token(32)
        self._session.add(
            OneTimeToken(
                user_id=user.id,
                purpose=purpose,
                token_hash=hash_token(raw),
                expires_at=utcnow() + timedelta(seconds=ttl_seconds),
            )
        )
        await self._session.flush()
        return raw

    async def _consume_one_time_token(self, raw: str, purpose: str) -> User:
        record = await self._session.scalar(
            select(OneTimeToken).where(
                OneTimeToken.token_hash == hash_token(raw), OneTimeToken.purpose == purpose
            )
        )
        if record is None or record.used_at is not None or record.expires_at <= utcnow():
            raise AppError("This link is invalid or has expired.", hint="Request a new link and try again.")
        user = await self._session.get(User, record.user_id)
        if user is None:
            raise AppError("This link is invalid or has expired.", hint="Request a new link and try again.")
        record.used_at = utcnow()
        return user

    def _web_link(self, path: str, token: str) -> str:
        return f"{self._settings.public_web_url.rstrip('/')}{path}?{urlencode({'token': token})}"

    async def send_verification_email(self, user: User) -> None:
        if user.email_verified_at is not None:
            return
        raw = await self._create_one_time_token(
            user, PURPOSE_VERIFY_EMAIL, self._settings.email_token_ttl_seconds
        )
        brand = get_brand().name
        await self._email.send(
            action_email(
                user.email,
                f"Confirm your {brand} email",
                f"Welcome to {brand}! Confirm your email address to secure your account.",
                "Confirm email",
                self._web_link("/auth/verify-email", raw),
                "If you did not create this account, you can ignore this email.",
            )
        )

    async def verify_email(self, raw: str) -> User:
        user = await self._consume_one_time_token(raw, PURPOSE_VERIFY_EMAIL)
        user.email_verified_at = user.email_verified_at or utcnow()
        return user

    async def request_password_reset(self, email: str) -> None:
        user = await self.get_user_by_email(email)
        if user is None or not user.is_active:
            return
        raw = await self._create_one_time_token(
            user, PURPOSE_RESET_PASSWORD, self._settings.password_reset_ttl_seconds
        )
        await self._email.send(
            action_email(
                user.email,
                f"Reset your {get_brand().name} password",
                "We received a request to reset your password. This link works for one hour.",
                "Choose a new password",
                self._web_link("/auth/reset-password", raw),
                "If you did not ask for this, you can ignore this email; your password stays the same.",
            )
        )

    async def reset_password(self, raw: str, new_password: str) -> User:
        user = await self._consume_one_time_token(raw, PURPOSE_RESET_PASSWORD)
        check_password_strength(new_password, user.email)
        user.password_hash = hash_password(new_password)
        user.email_verified_at = user.email_verified_at or utcnow()
        user.failed_login_count = 0
        user.locked_until = None
        await self.revoke_all_sessions(user.id)
        return user

    async def change_password(self, user: User, current_password: str, new_password: str) -> None:
        if user.password_hash is not None and not verify_password(current_password, user.password_hash):
            raise AuthenticationError("Your current password is incorrect.")
        check_password_strength(new_password, user.email)
        user.password_hash = hash_password(new_password)
        await self.revoke_all_sessions(user.id)

    def issue_mfa_challenge(self, user: User) -> str:
        return encode_jwt(user.id, "mfa", MFA_TOKEN_TTL_SECONDS)

    def begin_mfa_setup(self, user: User) -> tuple[str, str]:
        if user.totp_enabled:
            raise ConflictError("Two-factor authentication is already on.")
        secret = pyotp.random_base32()
        user.totp_secret_encrypted = seal_text(self._key, secret)
        uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=get_brand().name)
        return secret, uri

    def _totp_matches(self, user: User, code: str) -> bool:
        if not user.totp_secret_encrypted:
            return False
        secret = open_text(self._key, user.totp_secret_encrypted)
        return bool(pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1))

    async def enable_mfa(self, user: User, code: str) -> list[str]:
        if user.totp_enabled:
            raise ConflictError("Two-factor authentication is already on.")
        if not self._totp_matches(user, code):
            raise AppError(
                "That code is not correct.", hint="Enter the 6-digit code shown in your authenticator app."
            )
        user.totp_enabled = True
        return await self._regenerate_recovery_codes(user)

    async def _regenerate_recovery_codes(self, user: User) -> list[str]:
        existing = await self._session.scalars(select(RecoveryCode).where(RecoveryCode.user_id == user.id))
        for record in existing:
            await self._session.delete(record)
        codes = [f"{secrets.token_hex(3)}-{secrets.token_hex(3)}" for _ in range(RECOVERY_CODE_COUNT)]
        self._session.add_all(RecoveryCode(user_id=user.id, code_hash=hash_token(code)) for code in codes)
        await self._session.flush()
        return codes

    async def verify_second_factor(self, user: User, code: str) -> bool:
        if not user.totp_enabled:
            return False
        if self._totp_matches(user, code):
            return True
        record = await self._session.scalar(
            select(RecoveryCode).where(
                RecoveryCode.user_id == user.id,
                RecoveryCode.code_hash == hash_token(code.strip().lower()),
                RecoveryCode.used_at.is_(None),
            )
        )
        if record is None:
            return False
        record.used_at = utcnow()
        return True

    async def disable_mfa(self, user: User, password: str, code: str) -> None:
        if user.password_hash is not None and not verify_password(password, user.password_hash):
            raise AuthenticationError("Your password is incorrect.")
        if not await self.verify_second_factor(user, code):
            raise AppError("That code is not correct.")
        user.totp_enabled = False
        user.totp_secret_encrypted = None
        existing = await self._session.scalars(select(RecoveryCode).where(RecoveryCode.user_id == user.id))
        for record in existing:
            await self._session.delete(record)

    async def remaining_recovery_codes(self, user: User) -> int:
        count = await self._session.scalar(
            select(func.count())
            .select_from(RecoveryCode)
            .where(RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None))
        )
        return int(count or 0)

    async def list_sessions(self, user: User, current_refresh: str | None) -> list[dict[str, object]]:
        rows = await self._session.scalars(
            select(RefreshToken)
            .where(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > utcnow(),
            )
            .order_by(RefreshToken.created_at.desc())
        )
        current_family: str | None = None
        if current_refresh:
            current = await self._session.scalar(
                select(RefreshToken).where(RefreshToken.token_hash == hash_token(current_refresh))
            )
            current_family = current.family_id if current else None
        sessions: dict[str, dict[str, object]] = {}
        for record in rows:
            if record.family_id in sessions:
                continue
            sessions[record.family_id] = {
                "id": record.family_id,
                "user_agent": record.user_agent,
                "last_active_at": record.created_at,
                "expires_at": record.expires_at,
                "current": record.family_id == current_family,
            }
        return list(sessions.values())

    async def revoke_session(self, user: User, family_id: str) -> None:
        owned = await self._session.scalar(
            select(func.count())
            .select_from(RefreshToken)
            .where(RefreshToken.user_id == user.id, RefreshToken.family_id == family_id)
        )
        if not owned:
            raise AppError("This session does not exist.")
        await self._revoke_family(family_id)
