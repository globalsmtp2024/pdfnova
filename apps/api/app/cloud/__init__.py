from app.cloud.base import CloudEntry, CloudError, CloudProvider, Downloaded, TokenSet
from app.cloud.dropbox import DropboxProvider
from app.cloud.fake import FakeCloudProvider
from app.cloud.google import GoogleDriveProvider
from app.cloud.onedrive import OneDriveProvider
from app.core.config import Settings

PROVIDER_CLASSES: tuple[type[CloudProvider], ...] = (
    GoogleDriveProvider,
    DropboxProvider,
    OneDriveProvider,
    FakeCloudProvider,
)


def configured_providers(settings: Settings) -> dict[str, CloudProvider]:
    return {cls.name: cls(settings) for cls in PROVIDER_CLASSES if cls.configured(settings)}


__all__ = [
    "CloudEntry",
    "CloudError",
    "CloudProvider",
    "Downloaded",
    "TokenSet",
    "configured_providers",
]
