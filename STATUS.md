# Status

## Live tools
Everything in `apps/web/src/config/live.ts`, including this session's additions: scan-to-pdf, pdf-to-pdfa, word-to-pdf, powerpoint-to-pdf, excel-to-pdf, ocr (html-to-pdf and url-to-pdf were already Live and now also pass on Linux).

## Coming soon
Any catalogue tool not in `live.ts`. Queue 2 shipped: editor, form builder, certificate signing, e-sign requests, redaction presets, visual compare, AI smart tools, workflow builder, batch, My files, teams, webhooks and SDKs, cloud imports, PWA, private mode, scheduled workflows, admin console, deletion verification, VPS deployment, legal and roadmap pages, config validation and seed.

## Remaining FAILED items
None blocked. `docs/FAILED.md` only notes that AI tools were verified against a local stub, with no real provider key.

## Notes
- Chrome-based tools skip the sandbox address-space cap (`limit_address_space = False`) and run with a short TMPDIR, because Chrome fails under RLIMIT_AS and with long socket paths.
- pyproject now declares previously missing dependencies (pypdfium2, pdfplumber, python-docx, openpyxl, markdown-it-py; python-pptx for dev smoke).
- PDF/A output is stamped and structured for 1b/2b/3b but not validated with veraPDF; it refuses unembedded fonts unless allowed.
- Pre-existing ruff and mypy findings remain in unrelated files.
- Known limits: editor find and replace works at text-object level; cloud providers verified only against the test double; non-English/Urdu locales are scaffolds that fall back to English.
- Queue 2 added `make seed`, `python -m app.seed` and strict startup validation of environment settings.
