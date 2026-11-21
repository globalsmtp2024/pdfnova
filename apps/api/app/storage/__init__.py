from app.core.config import Settings
from app.core.crypto import load_key
from app.storage.base import Storage
from app.storage.local import LocalStorage
from app.storage.s3 import S3Storage


def build_storage(settings: Settings) -> Storage:
    if settings.storage_backend == "s3":
        storage = S3Storage(
            settings.s3_bucket,
            endpoint_url=settings.s3_endpoint_url,
            region=settings.s3_region,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=(
                settings.s3_secret_access_key.get_secret_value() if settings.s3_secret_access_key else None
            ),
            server_side_encryption=settings.s3_server_side_encryption,
        )
        storage.ensure_bucket()
        return storage
    return LocalStorage(
        settings.storage_local_root, load_key(settings.storage_encryption_key.get_secret_value())
    )


__all__ = ["LocalStorage", "S3Storage", "Storage", "build_storage"]
