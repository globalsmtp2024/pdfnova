from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.storage.base import ObjectNotFoundError, Storage, validate_key

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

_SSE = {"ServerSideEncryption": "AES256"}


def content_disposition(filename: str) -> str:
    ascii_name = filename.encode("ascii", "ignore").decode("ascii").replace('"', "") or "download"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


class S3Storage(Storage):
    def __init__(
        self,
        bucket: str,
        *,
        endpoint_url: str | None,
        region: str,
        access_key_id: str | None,
        secret_access_key: str | None,
        client: "S3Client | None" = None,
        server_side_encryption: bool = True,
    ):
        self._bucket = bucket
        self._sse: dict[str, str] = dict(_SSE) if server_side_encryption else {}
        self._client: S3Client = client or boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "adaptive"}),
        )

    def ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except ClientError:
            self._client.create_bucket(Bucket=self._bucket)

    def put_bytes(self, key: str, data: bytes) -> None:
        self._client.put_object(Bucket=self._bucket, Key=validate_key(key), Body=data, **self._sse)  # type: ignore[arg-type]

    def put_file(self, key: str, source: Path) -> None:
        self._client.upload_file(str(source), self._bucket, validate_key(key), ExtraArgs=dict(self._sse))

    def get_file(self, key: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._client.download_file(self._bucket, validate_key(key), str(destination))
        except ClientError as exc:
            raise ObjectNotFoundError(key) from exc

    def iter_bytes(self, key: str) -> Iterator[bytes]:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=validate_key(key))
        except ClientError as exc:
            raise ObjectNotFoundError(key) from exc
        body = response["Body"]
        try:
            yield from body.iter_chunks(chunk_size=1024 * 1024)
        finally:
            body.close()

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=validate_key(key))
        except ClientError:
            return False
        return True

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=validate_key(key))

    def delete_prefix(self, prefix: str) -> int:
        validate_key(prefix.rstrip("/"))
        deleted = 0
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            objects: list[Any] = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            if objects:
                self._client.delete_objects(Bucket=self._bucket, Delete={"Objects": objects, "Quiet": True})
                deleted += len(objects)
        return deleted

    def presigned_download_url(self, key: str, filename: str, ttl_seconds: int) -> str | None:
        return self._client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self._bucket,
                "Key": validate_key(key),
                "ResponseContentDisposition": content_disposition(filename),
            },
            ExpiresIn=ttl_seconds,
        )
