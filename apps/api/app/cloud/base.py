from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from app.core.config import Settings


@dataclass(frozen=True)
class TokenSet:
    access_token: str
    refresh_token: str | None
    expires_at: datetime | None
    account_label: str = ""


@dataclass(frozen=True)
class CloudEntry:
    id: str
    name: str
    is_folder: bool
    size: int | None = None
    mime_type: str | None = None
    modified: str | None = None


@dataclass(frozen=True)
class Downloaded:
    filename: str
    data: bytes
    mime_type: str


class CloudError(Exception):
    def __init__(self, message: str, reauthorize: bool = False):
        super().__init__(message)
        self.message = message
        self.reauthorize = reauthorize


class CloudProvider(ABC):
    name: str
    label: str

    def __init__(self, settings: Settings):
        self.settings = settings

    @classmethod
    @abstractmethod
    def configured(cls, settings: Settings) -> bool: ...

    @abstractmethod
    def authorize_url(self, state: str, redirect_uri: str) -> str: ...

    @abstractmethod
    async def exchange_code(self, code: str, redirect_uri: str) -> TokenSet: ...

    @abstractmethod
    async def refresh(self, refresh_token: str) -> TokenSet: ...

    @abstractmethod
    async def list_files(self, access_token: str, folder_id: str | None, query: str) -> list[CloudEntry]: ...

    @abstractmethod
    async def download(self, access_token: str, file_id: str, max_bytes: int) -> Downloaded: ...

    @abstractmethod
    async def upload(
        self, access_token: str, folder_id: str | None, filename: str, data: bytes, mime_type: str
    ) -> CloudEntry: ...
