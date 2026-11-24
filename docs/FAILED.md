# Open items

No tool is blocked by a missing binary or a code failure. Office to PDF, OCR, HTML to PDF and URL to PDF were verified on Linux with LibreOffice, Tesseract (English and Urdu) and Chromium installed.

## Verified only against a local stand-in

| Tool | Slugs | Note |
|---|---|---|
| AI summarizer, Chat with PDF, Translate PDF, Smart redact, Extract structured data | `ai-summarize`, `ai-chat`, `ai-translate`, `ai-smart-redact`, `ai-extract-data` | Smoke runs passed against `scripts/ai_stub.py`, a local server that mimics the Anthropic messages API. No real provider key exists on this machine. Live use needs `AI_SHARED_API_KEY` (and `AI_SHARED_PROVIDER`, default `anthropic`) on the server or the user's own key in Settings. Without either, starting a task returns "AI features are not configured on this server." |
| Cloud import and export | `google-drive`, `dropbox`, `onedrive` | Implemented against each provider's public REST API behind `CloudProvider`; verified only with the built-in test double (`CLOUD_TEST_PROVIDER=true`). Real use needs `CLOUD_GOOGLE_CLIENT_ID/SECRET`, `CLOUD_DROPBOX_APP_KEY/SECRET` or `CLOUD_MICROSOFT_CLIENT_ID/SECRET` plus the redirect URI `<PUBLIC_API_URL>/api/v1/cloud/<provider>/callback` registered with the provider. |

## Implemented but not Live on this machine (item 5)

| Tool | Slugs | Error | Fix |
|---|---|---|---|
| PDF to Word, PowerPoint, Excel (OCR) | `pdf-to-word-ocr`, `pdf-to-powerpoint-ocr`, `pdf-to-excel-ocr` | `Text recognition is not available on this server yet.` (no `tesseract` on this Windows machine) | Install Tesseract with the languages you need, run `python scripts/smoke_tools.py pdf-to-word-ocr,pdf-to-powerpoint-ocr,pdf-to-excel-ocr`, then add the three slugs to `apps/web/src/config/live.ts`. The language list comes from `GET /api/v1/ocr/languages`. |
