from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.fair_use import get_fair_use
from app.models.user import User


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    display_name: str = Field(default="", max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class MfaLoginRequest(BaseModel):
    mfa_token: str = Field(min_length=10, max_length=2000)
    code: str = Field(min_length=6, max_length=20)


class TokenRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class EmailRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=1, max_length=256)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(default="", max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


class MfaCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=20)


class MfaDisableRequest(BaseModel):
    password: str = Field(default="", max_length=256)
    code: str = Field(min_length=6, max_length=20)


class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class RecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]


class AiKeySummary(BaseModel):
    provider: str
    last4: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    display_name: str
    email_verified: bool
    totp_enabled: bool
    has_password: bool
    is_admin: bool
    locale: str
    created_at: datetime
    retention_extended: bool
    retention_seconds: int
    ai_key: AiKeySummary | None

    @classmethod
    def from_user(cls, user: User) -> "UserResponse":
        limits = get_fair_use()
        return cls(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            email_verified=user.email_verified_at is not None,
            totp_enabled=user.totp_enabled,
            has_password=user.password_hash is not None,
            is_admin=user.is_admin,
            locale=user.locale,
            created_at=user.created_at,
            retention_extended=user.retention_extended,
            retention_seconds=(
                limits.extended_retention_seconds if user.retention_extended else limits.retention_seconds
            ),
            ai_key=(
                AiKeySummary(provider=user.ai_provider or "anthropic", last4=user.ai_key_last4 or "")
                if user.ai_api_key_encrypted
                else None
            ),
        )


class LoginResponse(BaseModel):
    user: UserResponse | None = None
    mfa_required: bool = False
    mfa_token: str | None = None


class MessageResponse(BaseModel):
    message: str
