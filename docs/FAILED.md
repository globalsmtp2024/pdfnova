# Open items

No tool is blocked by a missing binary or a code failure. Office to PDF, OCR, HTML to PDF and URL to PDF were verified on Linux with LibreOffice, Tesseract (English and Urdu) and Chromium installed.

## Verified only against a local stand-in

| Tool | Slugs | Note |
|---|---|---|
| AI summarizer, Chat with PDF, Translate PDF, Smart redact, Extract structured data | `ai-summarize`, `ai-chat`, `ai-translate`, `ai-smart-redact`, `ai-extract-data` | Smoke runs passed against `scripts/ai_stub.py`, a local server that mimics the Anthropic messages API. No real provider key exists on this machine. Live use needs `AI_SHARED_API_KEY` (and `AI_SHARED_PROVIDER`, default `anthropic`) on the server or the user's own key in Settings. Without either, starting a task returns "AI features are not configured on this server." |
