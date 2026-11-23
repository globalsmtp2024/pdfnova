# Tools implemented but not Live locally

These tools are fully implemented and registered, but their smoke run could not pass on this machine because a system binary is missing. They stay "Coming soon" here (not in `apps/web/src/config/live.ts`). Docker images install the binaries. After installing, run `apps\api\.venv\Scripts\python.exe scripts\smoke_tools.py word-to-pdf,ocr` and add the slugs to `live.ts`.

| Tool | Slugs | Error | Install |
|---|---|---|---|
| Word, PowerPoint, Excel to PDF | `word-to-pdf`, `powerpoint-to-pdf`, `excel-to-pdf` | `Office conversion is not available on this server yet.` (`soffice` not found) | `winget install TheDocumentFoundation.LibreOffice` (Windows) or `apt-get install libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui`. Override with `SOFFICE_BINARY`. |
| OCR PDF | `ocr` | `Text recognition is not available on this server yet.` (`tesseract` not found) | `winget install UB-Mannheim.TesseractOCR` plus the Urdu data file `urd.traineddata` in its `tessdata` folder, or `apt-get install tesseract-ocr tesseract-ocr-eng tesseract-ocr-urd`. Override with `TESSERACT_BINARY`. |
