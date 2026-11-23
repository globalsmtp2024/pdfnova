import json
from datetime import timedelta
from urllib.parse import urlencode

from app.cloud.base import CloudEntry, CloudProvider, Downloaded, TokenSet
from app.cloud.http import request, size_guard
from app.core.config import Settings
from app.db.base import utcnow

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105
API = "https://www.googleapis.com/drive/v3"
UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
SCOPES = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file"
FOLDER = "application/vnd.google-apps.folder"
GOOGLE_DOC_EXPORTS = {
    "application/vnd.google-apps.document": "application/pdf",
    "application/vnd.google-apps.spreadsheet": "application/pdf",
    "application/vnd.google-apps.presentation": "application/pdf",
}


def escape_query(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


class GoogleDriveProvider(CloudProvider):
    name = "google-drive"
    label = "Google Drive"

    @classmethod
    def configured(cls, settings: Settings) -> bool:
        return bool(settings.cloud_google_client_id and settings.cloud_google_client_secret)

    def _credentials(self) -> tuple[str, str]:
        secret = self.settings.cloud_google_client_secret
        return self.settings.cloud_google_client_id or "", secret.get_secret_value() if secret else ""

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        client_id, _ = self._credentials()
        return (
            AUTH_URL
            + "?"
            + urlencode(
                {
                    "client_id": client_id,
                    "redirect_uri": redirect_uri,
                    "response_type": "code",
                    "scope": SCOPES,
                    "access_type": "offline",
                    "prompt": "consent",
                    "state": state,
                }
            )
        )

    async def _token(self, form: dict[str, str]) -> TokenSet:
        client_id, secret = self._credentials()
        response = await request(
            "POST", TOKEN_URL, data={**form, "client_id": client_id, "client_secret": secret}
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
        info = await request(
            "GET",
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {tokens.access_token}"},
        )
        return TokenSet(
            tokens.access_token, tokens.refresh_token, tokens.expires_at, str(info.json().get("email", ""))
        )

    async def refresh(self, refresh_token: str) -> TokenSet:
        tokens = await self._token({"grant_type": "refresh_token", "refresh_token": refresh_token})
        return TokenSet(tokens.access_token, refresh_token, tokens.expires_at)

    async def list_files(self, access_token: str, folder_id: str | None, query: str) -> list[CloudEntry]:
        parent = escape_query(folder_id or "root")
        clauses = [f"'{parent}' in parents", "trashed = false"]
        if query:
            clauses = [f"name contains '{escape_query(query)}'", "trashed = false"]
        response = await request(
            "GET",
            f"{API}/files",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "q": " and ".join(clauses),
                "fields": "files(id,name,mimeType,size,modifiedTime)",
                "pageSize": 100,
                "orderBy": "folder,name",
            },
        )
        return [
            CloudEntry(
                id=entry["id"],
                name=entry["name"],
                is_folder=entry["mimeType"] == FOLDER,
                size=int(entry["size"]) if entry.get("size") else None,
                mime_type=entry["mimeType"],
                modified=entry.get("modifiedTime"),
            )
            for entry in response.json().get("files", [])
        ]

    async def download(self, access_token: str, file_id: str, max_bytes: int) -> Downloaded:
        headers = {"Authorization": f"Bearer {access_token}"}
        meta = (
            await request(
                "GET", f"{API}/files/{file_id}", headers=headers, params={"fields": "name,mimeType,size"}
            )
        ).json()
        size_guard(int(meta["size"]) if meta.get("size") else None, max_bytes)
        mime = meta["mimeType"]
        if mime in GOOGLE_DOC_EXPORTS:
            export = GOOGLE_DOC_EXPORTS[mime]
            response = await request(
                "GET", f"{API}/files/{file_id}/export", headers=headers, params={"mimeType": export}
            )
            name = meta["name"] if meta["name"].lower().endswith(".pdf") else meta["name"] + ".pdf"
            data = response.content
            mime = export
        else:
            response = await request(
                "GET", f"{API}/files/{file_id}", headers=headers, params={"alt": "media"}
            )
            name, data = meta["name"], response.content
        size_guard(len(data), max_bytes)
        return Downloaded(name, data, mime)

    async def upload(
        self, access_token: str, folder_id: str | None, filename: str, data: bytes, mime_type: str
    ) -> CloudEntry:
        metadata = {"name": filename, **({"parents": [folder_id]} if folder_id else {})}
        boundary = "pdfnova-boundary"
        body = (
            (
                f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
                f"{json.dumps(metadata)}\r\n"
                f"--{boundary}\r\nContent-Type: {mime_type}\r\n\r\n"
            ).encode()
            + data
            + f"\r\n--{boundary}--".encode()
        )
        response = await request(
            "POST",
            UPLOAD,
            params={"uploadType": "multipart", "fields": "id,name,mimeType,size"},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": f"multipart/related; boundary={boundary}",
            },
            content=body,
        )
        entry = response.json()
        return CloudEntry(entry["id"], entry["name"], False, len(data), mime_type)
