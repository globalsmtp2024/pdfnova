import base64
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Environment = Environment.DEVELOPMENT
    log_level: str = "INFO"
    log_json: bool = False

    public_api_url: str = "http://localhost:8000"
    public_web_url: str = "http://localhost:3000"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    secret_key: SecretStr = SecretStr("dev-insecure-secret-key-change-me-0123456789")
    storage_encryption_key: SecretStr = SecretStr("ZGV2LWluc2VjdXJlLWtleS0zMi1ieXRlcy1sb25nISE=")

    database_url: str = "sqlite+aiosqlite:///./var/pdfnova.db"
    redis_url: str | None = None

    queue_backend: Literal["inline", "arq"] = "inline"
    rate_limit_backend: Literal["memory", "redis"] = "memory"

    storage_backend: Literal["local", "s3"] = "local"
    storage_local_root: Path = Path("./var/storage")
    s3_bucket: str = "pdfnova"
    s3_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_access_key_id: str | None = None
    s3_secret_access_key: SecretStr | None = None
    s3_server_side_encryption: bool = True

    work_root: Path = Path("./var/work")
    upload_chunk_size: int = 8 * 1024 * 1024
    signed_url_ttl_seconds: int = 900
    job_timeout_seconds: int = 300
    ai_shared_provider: str = "anthropic"
    ai_shared_api_key: SecretStr | None = None
    job_memory_limit_mb: int = 2048
    sweeper_interval_seconds: int = 60

    access_token_ttl_seconds: int = 900
    refresh_token_ttl_seconds: int = 60 * 60 * 24 * 30
    email_token_ttl_seconds: int = 60 * 60 * 24
    password_reset_ttl_seconds: int = 60 * 60
    cookie_secure: bool = False
    cookie_domain: str | None = None

    email_backend: Literal["console", "smtp"] = "console"
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_use_tls: bool = True
    email_from: str = "no-reply@pdfnova.app"

    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None
    github_client_id: str | None = None
    github_client_secret: SecretStr | None = None

    cloud_google_client_id: str | None = None
    cloud_google_client_secret: SecretStr | None = None
    cloud_dropbox_app_key: str | None = None
    cloud_dropbox_app_secret: SecretStr | None = None
    cloud_microsoft_client_id: str | None = None
    cloud_microsoft_client_secret: SecretStr | None = None
    cloud_microsoft_tenant: str = "common"
    cloud_test_provider: bool = False

    sentry_dsn: str | None = None
    metrics_enabled: bool = True
    background_workers_in_api: bool = True
    webhooks_enabled: bool = True
    scheduler_enabled: bool = True
    webhook_allow_private: bool = False

    max_pdf_pages: int = 5000
    max_pdf_objects: int = 2_000_000
    max_decompression_ratio: int = 200
    qpdf_binary: str | None = None

    @model_validator(mode="after")
    def _validate_consistency(self) -> "Settings":
        problems: list[str] = []
        if self.queue_backend == "arq" and not self.redis_url:
            problems.append("REDIS_URL is required when QUEUE_BACKEND=arq")
        if self.rate_limit_backend == "redis" and not self.redis_url:
            problems.append("REDIS_URL is required when RATE_LIMIT_BACKEND=redis")
        if self.storage_backend == "s3" and not (self.s3_access_key_id and self.s3_secret_access_key):
            problems.append("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_BACKEND=s3")
        if self.email_backend == "smtp" and not self.smtp_host:
            problems.append("SMTP_HOST is required when EMAIL_BACKEND=smtp")
        for label, first, second in (
            ("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET", self.google_client_id, self.google_client_secret),
            ("GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET", self.github_client_id, self.github_client_secret),
            (
                "CLOUD_GOOGLE_CLIENT_ID/CLOUD_GOOGLE_CLIENT_SECRET",
                self.cloud_google_client_id,
                self.cloud_google_client_secret,
            ),
            (
                "CLOUD_DROPBOX_APP_KEY/CLOUD_DROPBOX_APP_SECRET",
                self.cloud_dropbox_app_key,
                self.cloud_dropbox_app_secret,
            ),
            (
                "CLOUD_MICROSOFT_CLIENT_ID/CLOUD_MICROSOFT_CLIENT_SECRET",
                self.cloud_microsoft_client_id,
                self.cloud_microsoft_client_secret,
            ),
        ):
            if bool(first) != bool(second):
                problems.append(f"{label} must be set together")
        try:
            key = base64.b64decode(self.storage_encryption_key.get_secret_value(), validate=True)
        except ValueError:
            problems.append("STORAGE_ENCRYPTION_KEY must be base64")
        else:
            if len(key) != 32:
                problems.append("STORAGE_ENCRYPTION_KEY must decode to exactly 32 bytes")
        if self.environment is Environment.PRODUCTION:
            if self.secret_key.get_secret_value().startswith("dev-insecure"):
                problems.append("SECRET_KEY must be set in production")
            elif len(self.secret_key.get_secret_value()) < 32:
                problems.append("SECRET_KEY must be at least 32 characters in production")
            if self.storage_encryption_key.get_secret_value().startswith("ZGV2LWluc2VjdXJl"):
                problems.append("STORAGE_ENCRYPTION_KEY must be set in production")
            if not self.cookie_secure:
                problems.append("COOKIE_SECURE must be true in production")
            if self.webhook_allow_private:
                problems.append("WEBHOOK_ALLOW_PRIVATE must be false in production")
            if self.cloud_test_provider:
                problems.append("CLOUD_TEST_PROVIDER must be false in production")
            if not self.public_web_url.startswith("https://"):
                problems.append("PUBLIC_WEB_URL must use https in production")
            if not self.public_api_url.startswith("https://") and "localhost" not in self.public_api_url:
                problems.append("PUBLIC_API_URL must use https in production")
        if problems:
            raise ValueError("Invalid configuration: " + "; ".join(problems))
        return self

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
