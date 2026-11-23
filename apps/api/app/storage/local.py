import io
import os
import shutil
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO

from app.core.crypto import FramedCipher
from app.storage.base import ObjectNotFoundError, Storage, validate_key


class LocalStorage(Storage):
    def __init__(self, root: Path, encryption_key: bytes):
        self._root = root.resolve()
        self._root.mkdir(parents=True, exist_ok=True)
        self._cipher = FramedCipher(encryption_key)

    def _path(self, key: str) -> Path:
        path = Path(os.path.normpath(self._root / validate_key(key)))
        if self._root not in path.parents:
            raise ObjectNotFoundError(key)
        return path

    def _write_encrypted(self, key: str, source: BinaryIO) -> None:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temporary.open("wb") as sink:
                self._cipher.encrypt_stream(source, sink)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)

    def put_bytes(self, key: str, data: bytes) -> None:
        self._write_encrypted(key, io.BytesIO(data))

    def put_file(self, key: str, source: Path) -> None:
        with source.open("rb") as handle:
            self._write_encrypted(key, handle)

    def iter_bytes(self, key: str) -> Iterator[bytes]:
        path = self._path(key)
        if not path.is_file():
            raise ObjectNotFoundError(key)
        with path.open("rb") as handle:
            yield from self._cipher.decrypt_stream(handle)

    def get_file(self, key: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as sink:
            for chunk in self.iter_bytes(key):
                sink.write(chunk)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> int:
        directory = self._path(prefix.rstrip("/"))
        if not directory.exists():
            return 0
        if directory.is_file():
            directory.unlink()
            return 1
        count = sum(1 for p in directory.rglob("*") if p.is_file())
        shutil.rmtree(directory, ignore_errors=True)
        return count

    def count_prefix(self, prefix: str) -> int:
        directory = self._path(prefix.rstrip("/"))
        if not directory.exists():
            return 0
        if directory.is_file():
            return 1
        return sum(1 for entry in directory.rglob("*") if entry.is_file())

    def presigned_download_url(self, key: str, filename: str, ttl_seconds: int) -> str | None:
        return None
