import json
from datetime import timedelta
from urllib.parse import urlencode

from app.cloud.base import CloudEntry, CloudProvider, Downloaded, TokenSet
from app.cloud.http import request, size_guard
from app.core.config import Settings
from app.db.base import utcnow

AUTH_URL = "https://www.dropbox.com/oauth2/authorize"
TOKEN_URL = "https://api.dropboxapi.com/oauth2/token"  # noqa: S105
API = "https://api.dropboxapi.com/2"
CONTENT = "https://content.dropboxapi.com/2"


def path_arg(value: dict[str, object]) -> str:
    return json.dumps(value, ensure_ascii=True)


class DropboxProvider(CloudProvider):
    name = "dropbox"
    label = "Dropbox"

    @classmethod
    def configured(cls, settings: Settings) -> bool:
        return bool(settings.cloud_dropbox_app_key and settings.cloud_dropbox_app_secret)

    def _auth(self) -> tuple[str, str]:
        secret = self.settings.cloud_dropbox_app_secret
        return self.settings.cloud_dropbox_app_key or "", secret.get_secret_value() if secret else ""

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        key, _ = self._auth()
        return (
            AUTH_URL
            + "?"
            + urlencode(
                {
                    "client_id": key,
                    "redirect_uri": redirect_uri,
                    "response_type": "code",
                    "token_access_type": "offline",
                    "state": state,
                }
            )
        )

    async def _token(self, form: dict[str, str]) -> TokenSet:
        key, secret = self._auth()
        response = await request("POST", TOKEN_URL, data=form, auth=(key, secret))
        payload = response.json()
        return TokenSet(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token"),
            expires_at=utcnow() + timedelta(seconds=int(payload.get("expires_in", 14400))),
        )

    async def exchange_code(self, code: str, redirect_uri: str) -> TokenSet:
        tokens = await self._token(
            {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri}
        )
        info = await request(
            "POST",
            f"{API}/users/get_current_account",
            headers={"Authorization": f"Bearer {tokens.access_token}"},
        )
        return TokenSet(
            tokens.access_token, tokens.refresh_token, tokens.expires_at, str(info.json().get("email", ""))
        )

    async def refresh(self, refresh_token: str) -> TokenSet:
        tokens = await self._token({"grant_type": "refresh_token", "refresh_token": refresh_token})
        return TokenSet(tokens.access_token, refresh_token, tokens.expires_at)

    async def list_files(self, access_token: str, folder_id: str | None, query: str) -> list[CloudEntry]:
        headers = {"Authorization": f"Bearer {access_token}"}
        if query:
            response = await request(
                "POST",
                f"{API}/files/search_v2",
                headers=headers,
                json={"query": query, "options": {"max_results": 100}},
            )
            raw = [match["metadata"]["metadata"] for match in response.json().get("matches", [])]
        else:
            response = await request(
                "POST",
                f"{API}/files/list_folder",
                headers=headers,
                json={"path": folder_id or "", "limit": 100},
            )
            raw = response.json().get("entries", [])
        entries = [
            CloudEntry(
                id=entry.get("path_display", entry["name"]),
                name=entry["name"],
                is_folder=entry.get(".tag") == "folder",
                size=entry.get("size"),
                modified=entry.get("server_modified"),
            )
            for entry in raw
        ]
        return sorted(entries, key=lambda item: (not item.is_folder, item.name.lower()))

    async def download(self, access_token: str, file_id: str, max_bytes: int) -> Downloaded:
        response = await request(
            "POST",
            f"{CONTENT}/files/download",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Dropbox-API-Arg": path_arg({"path": file_id}),
            },
        )
        meta = json.loads(response.headers.get("dropbox-api-result", "{}"))
        size_guard(meta.get("size"), max_bytes)
        size_guard(len(response.content), max_bytes)
        return Downloaded(
            meta.get("name") or file_id.rsplit("/", 1)[-1], response.content, "application/octet-stream"
        )

    async def upload(
        self, access_token: str, folder_id: str | None, filename: str, data: bytes, mime_type: str
    ) -> CloudEntry:
        target = f"{(folder_id or '').rstrip('/')}/{filename}"
        response = await request(
            "POST",
            f"{CONTENT}/files/upload",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Dropbox-API-Arg": path_arg({"path": target, "mode": "add", "autorename": True}),
                "Content-Type": "application/octet-stream",
            },
            content=data,
        )
        meta = response.json()
        return CloudEntry(
            meta.get("path_display", target), meta.get("name", filename), False, len(data), mime_type
        )
