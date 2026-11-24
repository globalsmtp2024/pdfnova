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

## Final smoke run (item 17)

| Tool | Slugs | Error | Cause |
|---|---|---|---|
| Word, Excel, PowerPoint to PDF; OCR | `word-to-pdf`, `excel-to-pdf`, `powerpoint-to-pdf`, `ocr` | `Office conversion is not available on this server yet.` / `Text recognition is not available on this server yet.` | No LibreOffice or Tesseract on this Windows machine. They passed earlier on Linux; Docker images install both. |
| OCR conversions | `pdf-to-word-ocr`, `pdf-to-powerpoint-ocr`, `pdf-to-excel-ocr` | `Text recognition is not available on this server yet.` | No Tesseract here; not marked Live. |

## mypy

`python -m mypy app` reports 31 errors in 11 files. They come from the pinned `pikepdf==9.4.2` type stubs (`Iterable[Object]` has no `__next__`, `Object.get` typed as taking `None`) and from generic `JobContext` variance in `tools/image/images.py`. They were present before this queue, fixing them needs casts across `formbuilder.py`, `digital.py`, `pdfa.py`, `documents.py`, `structure.py`, `page_layout.py`, `clean.py`, `more_stamps.py`, `forms.py`, `images.py`, `office_out.py`, and they were left alone rather than risk behavior changes. Ruff is clean.
