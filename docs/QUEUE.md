# Build queue

Handoff file. Tick a box only when the tool is implemented and its smoke case passes. Failures go to FAILED.md.

- [x] 1 Image to PDF (JPG, PNG, WebP, TIFF)
- [x] 2 PDF to JPG/PNG
- [x] 3 PDF to Text
- [x] 4 PDF to Markdown
- [x] 5 Text to PDF
- [x] 6 Markdown to PDF
- [x] 7 Headers and footers
- [x] 8 Bates numbering
- [x] 9 Background
- [x] 10 Resize page size
- [x] 11 N-up and Booklet
- [x] 12 Grayscale
- [x] 13 Remove annotations
- [x] 14 Remove blank pages
- [x] 15 Reverse pages
- [x] 16 Linearize
- [x] 17 Bookmarks editor
- [x] 18 Attachments manager
- [x] 19 Hyperlinks manager
- [x] 20 Sign PDF (draw/type/upload, place anywhere)
- [x] 21 Fill PDF forms
- [x] 22 Redact PDF (manual boxes + regex, true removal)
- [x] 23 Compare PDF (text diff)
- [x] 24 PDF to Word (own converter, pdfplumber + python-docx)
- [x] 25 PDF to Excel (pdfplumber tables)
- [x] 26 Word/PowerPoint/Excel to PDF (soffice)
- [x] 27 HTML to PDF and URL to PDF (Chromium, SSRF-safe)
- [x] 28 OCR PDF (Tesseract, English + Urdu)
- [x] 29 AI Summarizer (provider abstraction, Anthropic default, BYOK, simple fair-use budget)
- [x] 30 Chat with PDF (page citations)
- [x] 31 Translate PDF (text-block overlay)
- [x] 32 Smart Redact and Extract structured data
- [x] 33 API keys + public API docs page
- [x] 34 Share links
- [x] 35 Simple linear workflow runner
- [x] 36 Image tools (compress, resize, convert, crop)
- [x] 37 Scan to PDF
- [x] 38 PDF to PDF/A

Not in the queue and staying "Coming soon": full editor, e-sign requests, digital signatures, teams, admin panel, PWA, cloud integrations.

## Notes

- 26 and 28 are Live: verified on Linux with LibreOffice and Tesseract installed.
- 27 HTML to PDF and URL to PDF run in headless Chrome with all network access blocked; URL to PDF takes a page fetched through Import from a link.
