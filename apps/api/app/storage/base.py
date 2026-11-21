import re
from abc import ABC, abstractmethod
from collections.abc import Iterator
from pathlib import Path

_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-./]{0,510}$")


class StorageKeyError(ValueError):
    pass


class ObjectNotFoundError(FileNotFoundError):
    pass


def validate_key(key: str) -> str:
    if not _KEY_PATTERN.fullmatch(key) or ".." in key.split("/") or "//" in key:
        raise StorageKeyError(f"Invalid storage key: {key!r}")
    return key


def task_input_key(task_id: str, file_id: str) -> str:
    return f"tasks/{task_id}/in/{file_id}"


def task_output_key(task_id: str, file_id: str) -> str:
    return f"tasks/{task_id}/out/{file_id}"


def upload_part_key(task_id: str, file_id: str, index: int) -> str:
    return f"tasks/{task_id}/parts/{file_id}/{index:06d}"


def task_prefix(task_id: str) -> str:
    return f"tasks/{task_id}/"


class Storage(ABC):
    @abstractmethod
    def put_bytes(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    def put_file(self, key: str, source: Path) -> None: ...

    @abstractmethod
    def get_file(self, key: str, destination: Path) -> None: ...

    @abstractmethod
    def iter_bytes(self, key: str) -> Iterator[bytes]: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def delete_prefix(self, prefix: str) -> int: ...

    @abstractmethod
    def presigned_download_url(self, key: str, filename: str, ttl_seconds: int) -> str | None: ...

    def append_parts_to(self, keys: list[str], destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as sink:
            for key in keys:
                for chunk in self.iter_bytes(key):
                    sink.write(chunk)
