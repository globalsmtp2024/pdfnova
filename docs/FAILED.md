# Tools implemented but not Live locally

These tools are fully implemented and registered, but their smoke run could not pass on this machine because a system binary is missing. They stay "Coming soon" here (not in `apps/web/src/config/live.ts`). Docker images install the binaries. After installing, run `apps\api\.venv\Scripts\python.exe scripts\smoke_tools.py word-to-pdf,ocr` and add the slugs to `live.ts`.

| Tool | Slugs | Error | Install |
|---|---|---|---|
| Word, PowerPoint, Excel to PDF | `word-to-pdf`, `powerpoint-to-pdf`, `excel-to-pdf` | `Office conversion is not available on this server yet.` (`soffice` not found) | `winget install TheDocumentFoundation.LibreOffice` (Windows) or `apt-get install libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui`. Override with `SOFFICE_BINARY`. |
| OCR PDF | `ocr` | `Text recognition is not available on this server yet.` (`tesseract` not found) | `winget install UB-Mannheim.TesseractOCR` plus the Urdu data file `urd.traineddata` in its `tessdata` folder, or `apt-get install tesseract-ocr tesseract-ocr-eng tesseract-ocr-urd`. Override with `TESSERACT_BINARY`. |

## Verified only against a local stand-in

| Tool | Slugs | Note |
|---|---|---|
| AI summarizer, Chat with PDF, Translate PDF, Smart redact, Extract structured data | `ai-summarize`, `ai-chat`, `ai-translate`, `ai-smart-redact`, `ai-extract-data` | Smoke runs passed against `scripts/ai_stub.py`, a local server that mimics the Anthropic messages API. No real provider key exists on this machine. Live use needs `AI_SHARED_API_KEY` (and `AI_SHARED_PROVIDER`, default `anthropic`) on the server or the user's own key in Settings. Without either, starting a task returns "AI features are not configured on this server." |
