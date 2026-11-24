# Status

## Live
81 of 84 catalogue tools are Live (everything listed in `apps/web/src/config/live.ts`). Besides the tools, these exist and work in code: browser editor, form builder, certificate signing, e-sign requests, redaction presets, visual compare, AI smart tools, workflow builder and gallery, batch, My files, teams, webhooks, API keys with scopes and SDKs, cloud imports, installable app and share target, on-device private mode (merge, split, rotate, extract pages, images to PDF, metadata), scheduled workflows, admin console, verified deletion, Custom (OpenAI-compatible) AI provider, English and Urdu (right-to-left) interface, legal and roadmap pages.

## Coming soon
Only three tools are not Live: `pdf-to-word-ocr`, `pdf-to-powerpoint-ocr` and `pdf-to-excel-ocr`. They are built and have smoke cases, but they need Tesseract, which is not installed on the development machine, so they have not been verified end to end. They go Live once their smoke cases pass where Tesseract is installed (the Docker image installs it).

## Unverified
- PDF/A output is structured for 1b/2b/3b but has not been checked with an independent validator such as veraPDF.
- AI tools have only been run against a local stub server, never against a real provider key.
- Cloud providers (Google Drive, Dropbox, OneDrive) have only been run against a test double.
- E-sign emails have not been sent through a real SMTP server.
- Lighthouse and load tests have never been run.
- The Docker files have never been run on this machine.
- Playwright and pytest suites were not run in the latest finishing session; only per-tool smoke checks, typecheck and i18n check.
- Interface languages other than English and Urdu are scaffolds that fall back to English. Legal documents and blog articles are English only (the Urdu pages say so).
- Keyboard-only and screen reader testing of every tool has not been done.

## Notes
- Chrome-based tools skip the sandbox address-space cap and run with a short TMPDIR, because Chrome fails under RLIMIT_AS and with long socket paths.
- Editor find and replace works at text-object level and can miss text split across objects.
- Pre-existing ruff and mypy findings may remain in unrelated files.
- Failures and blocked items are recorded in `docs/FAILED.md`.

## Final check results (QUEUE 3)

| Check | Result |
|---|---|
| `npm run typecheck` | passes |
| `npm run i18n:check` | Urdu complete (2052 strings); RTL check clean |
| `npm run build` (production) | passes, 386 static pages |
| `eslint src` | no errors, no warnings |
| `ruff check` and `ruff format` (api) | clean |
| `mypy app` | 31 errors from pinned pikepdf stubs, listed in `docs/FAILED.md` |
| `scripts/smoke_tools.py`, all tools | 77 of 84 pass (AI tools and remove-images re-run and pass; AI only against the local stub) |
| Smoke failures | `word-to-pdf`, `excel-to-pdf`, `powerpoint-to-pdf`, `ocr`, `pdf-to-word-ocr`, `pdf-to-powerpoint-ocr`, `pdf-to-excel-ocr`: LibreOffice and Tesseract are not installed on this machine (see `docs/FAILED.md`) |

Note: the first three Office tools and `ocr` stay marked Live because they passed on Linux with the binaries installed; the three OCR conversion tools stay Coming soon.
