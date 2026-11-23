import io
import threading
from datetime import timedelta
from urllib.parse import urlencode

import pikepdf

from app.cloud.base import CloudEntry, CloudError, CloudProvider, Downloaded, TokenSet
from app.core.config import Settings
from app.db.base import utcnow

_LOCK = threading.Lock()
_STORE: dict[str, dict[str, tuple[str, str, bytes, str]]] = {}


def blank_pdf() -> bytes:
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(200, 200))
    buffer = io.BytesIO()
    pdf.save(buffer)
    return buffer.getvalue()


def reset_store() -> None:
    with _LOCK:
        _STORE.clear()


def seed(label: str, name: str, data: bytes, mime_type: str = "application/pdf", folder: str = "root") -> str:
    with _LOCK:
        files = _STORE.setdefault(label, {})
        identifier = f"f{len(files) + 1}"
        files[identifier] = (folder, name, data, mime_type)
        return identifier


class FakeCloudProvider(CloudProvider):
    name = "testcloud"
    label = "Test cloud"

    @classmethod
    def configured(cls, settings: Settings) -> bool:
        return settings.cloud_test_provider

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        return redirect_uri + "?" + urlencode({"code": "fake-code", "state": state})

    async def exchange_code(self, code: str, redirect_uri: str) -> TokenSet:
        if code != "fake-code":
            raise CloudError("The authorization code was rejected.")
        return TokenSet("fake-access", "fake-refresh", utcnow() + timedelta(hours=1), "tester@example.com")

    async def refresh(self, refresh_token: str) -> TokenSet:
        return TokenSet("fake-access-2", refresh_token, utcnow() + timedelta(hours=1))

    def _files(self) -> dict[str, tuple[str, str, bytes, str]]:
        with _LOCK:
            files = _STORE.setdefault("tester@example.com", {})
            if not files:
                files["f1"] = ("root", "sample.pdf", blank_pdf(), "application/pdf")
                files["f2"] = ("docs", "nested.pdf", blank_pdf(), "application/pdf")
            return files

    async def list_files(self, access_token: str, folder_id: str | None, query: str) -> list[CloudEntry]:
        if access_token not in {"fake-access", "fake-access-2"}:
            raise CloudError("Connect again.", reauthorize=True)
        files = self._files()
        entries: list[CloudEntry] = []
        if not folder_id and not query:
            entries.append(CloudEntry("docs", "Docs", True))
        for identifier, (folder, name, data, mime) in files.items():
            if query:
                if query.lower() not in name.lower():
                    continue
            elif folder != (folder_id or "root"):
                continue
            entries.append(CloudEntry(identifier, name, False, len(data), mime))
        return entries

    async def download(self, access_token: str, file_id: str, max_bytes: int) -> Downloaded:
        files = self._files()
        if file_id not in files:
            raise CloudError("That file was not found in your cloud account.")
        _, name, data, mime = files[file_id]
        if len(data) > max_bytes:
            raise CloudError("That file is larger than the allowed size.")
        return Downloaded(name, data, mime)

    async def upload(
        self, access_token: str, folder_id: str | None, filename: str, data: bytes, mime_type: str
    ) -> CloudEntry:
        files = self._files()
        identifier = f"f{len(files) + 1}"
        files[identifier] = (folder_id or "root", filename, data, mime_type)
        return CloudEntry(identifier, filename, False, len(data), mime_type)
