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

# QUEUE 2

Phase 3 leftovers
- [x] 1 PDF to PowerPoint
- [x] 2 PDF to HTML
- [x] 3 PDF to CSV tables
- [x] 4 Remove duplicate pages, Remove images, Remove JavaScript/hidden data
- [x] 5 Interleave odd/even scans
- [x] 6 Image tools: remove background (rembg if installable), image watermark, add text to image

Phase 4
- [ ] 7 Digital signature (pyHanko, PKCS#12 in memory only, visible/invisible) and Verify signatures
- [ ] 8 Full PDF editor v1 (pdf.js canvas, text, image, shapes, highlight, draw, notes, links, undo/redo, backend operation list)
- [ ] 9 Editor: edit existing text (redact-and-replace) and find/replace
- [ ] 10 Create PDF forms (add fields) and auto-detect form fields
- [ ] 11 E-sign requests (fields, SMTP email links, single-use tokens, decline, audit trail, certificate, dashboard)
- [ ] 12 Compare PDF visual overlay diff + downloadable report
- [ ] 13 Redact pattern library (email, phone, Luhn card, CNIC, IBAN, SSN) + mandatory verification report

Phase 5
- [ ] 14 Smart Split and AI rename
- [ ] 15 Auto-categorize and key-dates extractor with .ics export
- [ ] 16 AI safety layer (injection delimiters, fair-use budget display, BYOK test connection)

Phase 6
- [ ] 17 Workflow visual builder (React Flow) + templates gallery with 6 templates
- [ ] 18 Batch runner UI with per-file status and retry-failed
- [ ] 19 My files workspace (save outputs, folders, rename, tags, search, trash, quota meter)
- [ ] 20 Teams (invite, roles, shared folders/workflows, central permission module)
- [ ] 21 API keys with scopes, webhooks, OpenAPI docs page, SDK skeletons, CLI
- [ ] 22 Cloud import/export (Drive, Dropbox, OneDrive behind CloudProvider with test double)
- [ ] 23 PWA (manifest, service worker, offline page, share-target)
- [ ] 24 Private mode (client-side pdf-lib tools)
- [ ] 25 Smart suggestions after upload and scheduled workflows
- [ ] 26 Admin panel
- [ ] 27 i18n completion (Urdu everywhere, RTL check, scaffold hi/ar/es/fr/de/pt/tr/id)

Phase 7
- [ ] 28 Security fixes (IDOR, rate limits, regex timeouts, formula-injection guard, headers/CSP, SSRF re-check)
- [ ] 29 Deletion sweeper and verified Delete-now
- [ ] 30 Deployment files and docs/DEPLOYMENT_VPS.md
- [ ] 31 Legal and info pages
- [ ] 32 .env.example + startup validation, Makefile, README quick start
