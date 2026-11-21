import io
import os

import pytest

from app.core.crypto import (
    FRAME_PLAINTEXT_SIZE,
    DecryptionError,
    FramedCipher,
    load_key,
    open_text,
    seal_text,
)
from app.core.ratelimit import MemoryRateLimiter
from app.core.security import (
    decode_jwt,
    encode_jwt,
    hash_password,
    hash_token,
    sign_value,
    verify_password,
    verify_signed_value,
)
from app.fair_use import get_fair_use

KEY = os.urandom(32)


@pytest.mark.parametrize(
    "size", [0, 1, FRAME_PLAINTEXT_SIZE - 1, FRAME_PLAINTEXT_SIZE, FRAME_PLAINTEXT_SIZE * 2 + 17]
)
def test_framed_cipher_round_trip(size: int) -> None:
    cipher = FramedCipher(KEY)
    plaintext = os.urandom(size)
    sink = io.BytesIO()
    assert cipher.encrypt_stream(io.BytesIO(plaintext), sink) == size
    encrypted = sink.getvalue()
    assert size < 16 or plaintext[:64] not in encrypted
    assert b"".join(cipher.decrypt_stream(io.BytesIO(encrypted))) == plaintext


def test_framed_cipher_detects_tampering_and_truncation() -> None:
    cipher = FramedCipher(KEY)
    sink = io.BytesIO()
    cipher.encrypt_stream(io.BytesIO(os.urandom(FRAME_PLAINTEXT_SIZE + 10)), sink)
    data = bytearray(sink.getvalue())
    data[40] ^= 0xFF
    with pytest.raises(DecryptionError):
        b"".join(cipher.decrypt_stream(io.BytesIO(bytes(data))))
    truncated = sink.getvalue()[: FRAME_PLAINTEXT_SIZE + 40]
    with pytest.raises(DecryptionError):
        b"".join(cipher.decrypt_stream(io.BytesIO(truncated)))
    with pytest.raises(DecryptionError):
        b"".join(FramedCipher(os.urandom(32)).decrypt_stream(io.BytesIO(sink.getvalue())))


def test_seal_text_round_trip() -> None:
    sealed = seal_text(KEY, "JBSWY3DPEHPK3PXP")
    assert "JBSWY3DP" not in sealed
    assert open_text(KEY, sealed) == "JBSWY3DPEHPK3PXP"
    with pytest.raises(DecryptionError):
        open_text(os.urandom(32), sealed)


def test_load_key_requires_32_bytes() -> None:
    with pytest.raises(ValueError):
        load_key("c2hvcnQ=")


def test_password_hashing() -> None:
    hashed = hash_password("correct horse battery")
    assert verify_password("correct horse battery", hashed)
    assert not verify_password("wrong", hashed)
    assert not verify_password("anything", None)
    assert not verify_password("anything", "not-a-hash")


def test_jwt_kinds_and_expiry() -> None:
    token = encode_jwt("user-1", "access", 60)
    decoded = decode_jwt(token, "access")
    assert decoded is not None and decoded.subject == "user-1"
    assert decode_jwt(token, "mfa") is None
    assert decode_jwt(encode_jwt("user-1", "access", -5), "access") is None
    assert decode_jwt(token + "x", "access") is None


def test_signed_values_and_token_hash() -> None:
    signature = sign_value("download:abc:123")
    assert verify_signed_value("download:abc:123", signature)
    assert not verify_signed_value("download:abc:124", signature)
    assert hash_token("a") == hash_token("a") != hash_token("b")


async def test_memory_rate_limiter() -> None:
    limiter = MemoryRateLimiter()
    results = [await limiter.hit("k", 3, 60) for _ in range(4)]
    assert [r.allowed for r in results] == [True, True, True, False]
    assert results[-1].retry_after >= 1
    assert (await limiter.hit("other", 3, 60)).allowed


def test_fair_use_defaults_are_generous(fair_use_override) -> None:
    limits = get_fair_use()
    assert limits.max_file_bytes == 200 * 1024 * 1024
    assert limits.max_files_per_task == 100
    assert limits.retention_seconds == 3600 and limits.extended_retention_seconds == 86400
    assert limits.ai_daily_requests < limits.daily_tasks
    fair_use_override(max_file_bytes=1234, daily_tasks=7)
    assert get_fair_use().max_file_bytes == 1234 and get_fair_use().daily_tasks == 7
