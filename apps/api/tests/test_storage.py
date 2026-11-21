import os
from pathlib import Path

import boto3
import pytest
from botocore.config import Config
from moto import mock_aws

from app.storage.base import ObjectNotFoundError, StorageKeyError, validate_key
from app.storage.local import LocalStorage
from app.storage.s3 import S3Storage, content_disposition


@pytest.fixture
def local(tmp_path: Path) -> LocalStorage:
    return LocalStorage(tmp_path / "store", os.urandom(32))


def test_local_storage_encrypts_at_rest(local: LocalStorage, tmp_path: Path) -> None:
    secret = b"%PDF-1.7 confidential payload " * 1000
    local.put_bytes("tasks/t1/in/f1", secret)
    raw = (tmp_path / "store" / "tasks" / "t1" / "in" / "f1").read_bytes()
    assert b"confidential" not in raw
    assert b"".join(local.iter_bytes("tasks/t1/in/f1")) == secret
    destination = tmp_path / "out" / "copy.bin"
    local.get_file("tasks/t1/in/f1", destination)
    assert destination.read_bytes() == secret


def test_local_storage_files_parts_and_delete(local: LocalStorage, tmp_path: Path) -> None:
    source = tmp_path / "source.bin"
    source.write_bytes(os.urandom(3 * 1024 * 1024 + 5))
    local.put_file("tasks/t2/in/a", source)
    assert local.exists("tasks/t2/in/a")
    local.put_bytes("tasks/t2/parts/a/000000", b"hello ")
    local.put_bytes("tasks/t2/parts/a/000001", b"world")
    joined = tmp_path / "joined.bin"
    local.append_parts_to(["tasks/t2/parts/a/000000", "tasks/t2/parts/a/000001"], joined)
    assert joined.read_bytes() == b"hello world"
    assert local.delete_prefix("tasks/t2/") == 3
    assert not local.exists("tasks/t2/in/a")
    assert local.delete_prefix("tasks/none/") == 0
    with pytest.raises(ObjectNotFoundError):
        list(local.iter_bytes("tasks/t2/in/a"))
    assert local.presigned_download_url("tasks/t2/in/a", "a.pdf", 60) is None


@pytest.mark.parametrize("key", ["../etc/passwd", "tasks/../../x", "/abs/path", "tasks//x", "", "tasks/a b"])
def test_invalid_keys_rejected(key: str, local: LocalStorage) -> None:
    with pytest.raises(StorageKeyError):
        validate_key(key)
    with pytest.raises(StorageKeyError):
        local.put_bytes(key, b"x")


def test_content_disposition_handles_unicode() -> None:
    header = content_disposition('رپورٹ "final".pdf')
    assert header.startswith('attachment; filename="')
    assert "filename*=UTF-8''" in header
    assert '"final"' not in header


@mock_aws
def test_s3_storage_round_trip(tmp_path: Path) -> None:
    client = boto3.client("s3", region_name="us-east-1", config=Config(signature_version="s3v4"))
    storage = S3Storage(
        "pdfnova-test",
        endpoint_url=None,
        region="us-east-1",
        access_key_id=None,
        secret_access_key=None,
        client=client,
    )
    storage.ensure_bucket()
    storage.put_bytes("tasks/t/in/a", b"alpha")
    source = tmp_path / "b.bin"
    source.write_bytes(b"beta" * 1000)
    storage.put_file("tasks/t/out/b", source)
    assert storage.exists("tasks/t/in/a")
    assert b"".join(storage.iter_bytes("tasks/t/in/a")) == b"alpha"
    destination = tmp_path / "dl.bin"
    storage.get_file("tasks/t/out/b", destination)
    assert destination.read_bytes() == b"beta" * 1000
    head = client.head_object(Bucket="pdfnova-test", Key="tasks/t/out/b")
    assert head["ServerSideEncryption"] == "AES256"
    url = storage.presigned_download_url("tasks/t/out/b", "report.pdf", 300)
    assert url is not None and "X-Amz-Signature" in url and "response-content-disposition" in url
    assert storage.delete_prefix("tasks/t/") == 2
    assert not storage.exists("tasks/t/in/a")
    with pytest.raises(ObjectNotFoundError):
        storage.get_file("tasks/t/in/a", destination)


@mock_aws
@pytest.mark.parametrize("enabled", [True, False])
def test_s3_server_side_encryption_header_is_configurable(enabled: bool) -> None:
    client = boto3.client("s3", region_name="us-east-1", config=Config(signature_version="s3v4"))
    sent: list[str | None] = []
    client.meta.events.register(
        "before-send.s3.PutObject",
        lambda request, **_: sent.append(request.headers.get("x-amz-server-side-encryption")),
    )
    storage = S3Storage(
        "pdfnova-sse",
        endpoint_url=None,
        region="us-east-1",
        access_key_id=None,
        secret_access_key=None,
        client=client,
        server_side_encryption=enabled,
    )
    storage.ensure_bucket()
    storage.put_bytes("tasks/t/in/a", b"alpha")
    expected = b"AES256" if enabled else None
    assert [value.encode() if isinstance(value, str) else value for value in sent] == [expected]
    assert b"".join(storage.iter_bytes("tasks/t/in/a")) == b"alpha"
