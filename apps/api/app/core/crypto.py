import base64
import os
import struct
from collections.abc import Iterator
from typing import BinaryIO

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"PNV1"
FRAME_PLAINTEXT_SIZE = 1024 * 1024
NONCE_SIZE = 12
TAG_SIZE = 16
_HEADER = struct.Struct(">I")


class DecryptionError(Exception):
    pass


def load_key(encoded: str) -> bytes:
    key = base64.b64decode(encoded)
    if len(key) != 32:
        raise ValueError("Storage encryption key must decode to exactly 32 bytes")
    return key


def seal_text(key: bytes, plaintext: str) -> str:
    nonce = os.urandom(NONCE_SIZE)
    sealed = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), b"sealed-text")
    return base64.urlsafe_b64encode(nonce + sealed).decode("ascii")


def open_text(key: bytes, token: str) -> str:
    raw = base64.urlsafe_b64decode(token.encode("ascii"))
    try:
        return AESGCM(key).decrypt(raw[:NONCE_SIZE], raw[NONCE_SIZE:], b"sealed-text").decode("utf-8")
    except Exception as exc:
        raise DecryptionError("Cannot open sealed value") from exc


class FramedCipher:
    def __init__(self, key: bytes):
        self._aead = AESGCM(key)

    def encrypt_frame(self, plaintext: bytes, frame_index: int, is_last: bool) -> bytes:
        nonce = os.urandom(NONCE_SIZE)
        aad = struct.pack(">Q?", frame_index, is_last)
        ciphertext = self._aead.encrypt(nonce, plaintext, aad)
        return _HEADER.pack(len(ciphertext)) + struct.pack(">?", is_last) + nonce + ciphertext

    def encrypt_stream(self, source: BinaryIO, sink: BinaryIO) -> int:
        sink.write(MAGIC)
        written = 0
        index = 0
        current = source.read(FRAME_PLAINTEXT_SIZE)
        while True:
            following = source.read(FRAME_PLAINTEXT_SIZE) if current else b""
            is_last = not following
            sink.write(self.encrypt_frame(current, index, is_last))
            written += len(current)
            if is_last:
                return written
            current = following
            index += 1

    def decrypt_stream(self, source: BinaryIO) -> Iterator[bytes]:
        if source.read(len(MAGIC)) != MAGIC:
            raise DecryptionError("Not an encrypted object")
        index = 0
        while True:
            header = source.read(_HEADER.size + 1)
            if len(header) != _HEADER.size + 1:
                raise DecryptionError("Truncated object")
            (length,) = _HEADER.unpack(header[: _HEADER.size])
            is_last = bool(header[_HEADER.size])
            nonce = source.read(NONCE_SIZE)
            ciphertext = source.read(length)
            if len(nonce) != NONCE_SIZE or len(ciphertext) != length:
                raise DecryptionError("Truncated object")
            aad = struct.pack(">Q?", index, is_last)
            try:
                yield self._aead.decrypt(nonce, ciphertext, aad)
            except Exception as exc:
                raise DecryptionError("Integrity check failed") from exc
            if is_last:
                return
            index += 1
