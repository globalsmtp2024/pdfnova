import base64
import hashlib
import hmac
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

TokenKind = Literal["access", "mfa", "anon", "oauth_state"]

_hasher = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=2)
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing")
JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def generate_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _secret() -> bytes:
    return get_settings().secret_key.get_secret_value().encode("utf-8")


def encode_jwt(subject: str, kind: TokenKind, ttl_seconds: int, extra: dict[str, Any] | None = None) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": subject,
        "typ": kind,
        "iat": now,
        "exp": now + ttl_seconds,
        "jti": uuid.uuid4().hex,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


@dataclass(frozen=True)
class DecodedToken:
    subject: str
    kind: str
    claims: dict[str, Any]


def decode_jwt(token: str, expected_kind: TokenKind) -> DecodedToken | None:
    try:
        claims = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None
    if claims.get("typ") != expected_kind:
        return None
    return DecodedToken(subject=str(claims["sub"]), kind=expected_kind, claims=claims)


def sign_value(value: str) -> str:
    digest = hmac.new(_secret(), value.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def verify_signed_value(value: str, signature: str) -> bool:
    return hmac.compare_digest(sign_value(value), signature)


def constant_time_equals(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))
