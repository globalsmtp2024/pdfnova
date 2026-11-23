from datetime import timedelta
from urllib.parse import quote, urlencode

from app.cloud.base import CloudEntry, CloudProvider, Downloaded, TokenSet
from app.cloud.http import request, size_guard
from app.core.config import Settings
from app.db.base import utcnow

GRAPH = "https://graph.microsoft.com/v1.0"
SCOPES = "Files.ReadWrite offline_access User.Read"
SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024
SESSION_CHUNK = 320 * 1024 * 10


class OneDriveProvider(CloudProvider):
    name = "onedrive"
    label = "OneDrive"

    @classmethod
    def configured(cls, settings: Settings) -> bool:
        return bool(settings.cloud_microsoft_client_id and settings.cloud_microsoft_client_secret)

    def _endpoint(self, leaf: str) -> str:
        return f"https://login.microsoftonline.com/{self.settings.cloud_microsoft_tenant}/oauth2/v2.0/{leaf}"

    def _credentials(self) -> tuple[str, str]:
        secret = self.settings.cloud_microsoft_client_secret
        return self.settings.cloud_microsoft_client_id or "", secret.get_secret_value() if secret else ""

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        client_id, _ = self._credentials()
        return (
            self._endpoint("authorize")
            + "?"
            + urlencode(
                {
                    "client_id": client_id,
                    "redirect_uri": redirect_uri,
                    "response_type": "code",
                    "scope": SCOPES,
                    "state": state,
                    "response_mode": "query",
                }
            )
        )

    async def _token(self, form: dict[str, str]) -> TokenSet:
        client_id, secret = self._credentials()
        response = await request(
            "POST",
            self._endpoint("token"),
            data={**form, "client_id": client_id, "client_secret": secret, "scope": SCOPES},
        )
        payload = response.json()
        return TokenSet(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token"),
            expires_at=utcnow() + timedelta(seconds=int(payload.get("expires_in", 3600))),
        )

    async def exchange_code(self, code: str, redirect_uri: str) -> TokenSet:
        tokens = await self._token(
            {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri}
        )
        info = await request("GET", f"{GRAPH}/me", headers={"Authorization": f"Bearer {tokens.access_token}"})
        payload = info.json()
        label = str(payload.get("mail") or payload.get("userPrincipalName") or "")
        return TokenSet(tokens.access_token, tokens.refresh_token, tokens.expires_at, label)

    async def refresh(self, refresh_token: str) -> TokenSet:
        tokens = await self._token({"grant_type": "refresh_token", "refresh_token": refresh_token})
        return TokenSet(tokens.access_token, tokens.refresh_token or refresh_token, tokens.expires_at)

    async def list_files(self, access_token: str, folder_id: str | None, query: str) -> list[CloudEntry]:
        headers = {"Authorization": f"Bearer {access_token}"}
        if query:
            safe = query.replace("'", "''")
            url = f"{GRAPH}/me/drive/root/search(q='{quote(safe)}')"
        elif folder_id:
            url = f"{GRAPH}/me/drive/items/{quote(folder_id)}/children"
        else:
            url = f"{GRAPH}/me/drive/root/children"
        response = await request(
            "GET",
            url,
            headers=headers,
            params={"$top": 100, "$select": "id,name,size,folder,file,lastModifiedDateTime"},
        )
        entries = [
            CloudEntry(
                id=item["id"],
                name=item["name"],
                is_folder="folder" in item,
                size=item.get("size"),
                mime_type=(item.get("file") or {}).get("mimeType"),
                modified=item.get("lastModifiedDateTime"),
            )
            for item in response.json().get("value", [])
        ]
        return sorted(entries, key=lambda item: (not item.is_folder, item.name.lower()))

    async def download(self, access_token: str, file_id: str, max_bytes: int) -> Downloaded:
        headers = {"Authorization": f"Bearer {access_token}"}
        meta = (
            await request(
                "GET",
                f"{GRAPH}/me/drive/items/{quote(file_id)}",
                headers=headers,
                params={"$select": "name,size,file"},
            )
        ).json()
        size_guard(meta.get("size"), max_bytes)
        response = await request("GET", f"{GRAPH}/me/drive/items/{quote(file_id)}/content", headers=headers)
        size_guard(len(response.content), max_bytes)
        return Downloaded(
            meta["name"],
            response.content,
            (meta.get("file") or {}).get("mimeType", "application/octet-stream"),
        )

    async def upload(
        self, access_token: str, folder_id: str | None, filename: str, data: bytes, mime_type: str
    ) -> CloudEntry:
        headers = {"Authorization": f"Bearer {access_token}"}
        base = f"{GRAPH}/me/drive/items/{quote(folder_id)}" if folder_id else f"{GRAPH}/me/drive/root"
        target = f"{base}:/{quote(filename)}:"
        if len(data) <= SIMPLE_UPLOAD_LIMIT:
            response = await request(
                "PUT", f"{target}/content", headers={**headers, "Content-Type": mime_type}, content=data
            )
            created = response.json()
            return CloudEntry(created["id"], created["name"], False, len(data), mime_type)
        session = (
            await request(
                "POST",
                f"{target}/createUploadSession",
                headers=headers,
                json={"item": {"@microsoft.graph.conflictBehavior": "rename"}},
            )
        ).json()
        item: dict[str, str] = {}
        for start in range(0, len(data), SESSION_CHUNK):
            chunk = data[start : start + SESSION_CHUNK]
            response = await request(
                "PUT",
                session["uploadUrl"],
                headers={
                    "Content-Length": str(len(chunk)),
                    "Content-Range": f"bytes {start}-{start + len(chunk) - 1}/{len(data)}",
                },
                content=chunk,
            )
            if response.status_code in {200, 201}:
                item = response.json()
        return CloudEntry(item.get("id", ""), item.get("name", filename), False, len(data), mime_type)
