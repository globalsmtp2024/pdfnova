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
