# Project conventions

Read `docs/PLAN.md` first; it holds architecture, folder tree and phase checklist. Keep it updated.

## Hard rules
- No code comments or docstrings. Use clear names.
- No placeholders, TODOs or fake functionality. Real binaries only (qpdf, Tesseract, LibreOffice) installed in Dockerfiles.
- License safety: never use AGPL/GPL code (PyMuPDF/fitz, Ghostscript, mupdf). Record every dependency in `docs/LICENSES.md`.
- Brand name only from `packages/shared/brand.json`.
- Never build shell strings from user input; subprocesses use argument lists with timeouts.
- Never log file contents or filenames supplied by users at info level.
- Every tool gets automated tests with real generated fixtures. Every PDF output in tests passes `qpdf --check` via `tests/qpdf_check.assert_qpdf_ok`, which fails loudly if qpdf is missing (locally: `winget install QPDF.QPDF`).
- Everything is free. No plans, tiers, paywalls or payment code; limits come only from `app/fair_use.py` (`FAIR_USE_*` env vars). The donation page unlocks nothing.
- Tools ship as vertical slices: backend, option panel, PageGrid/thumbnails/password prompt where relevant, Urdu strings, tools-content entry and a Playwright e2e. A tool is marked Live only after its e2e passes.

## Backend (`apps/api`)
- Python package is `app`. Pydantic v2, SQLAlchemy 2 async, strict mypy.
- New tool: one module in `app/tools/<category>/` subclassing `Tool`; auto-discovered. See `docs/ADDING_A_TOOL.md`.
- Commands (from `apps/api`, venv at `.venv`):
  - `python -m pytest`
  - `python -m ruff check . && python -m ruff format --check .`
  - `python -m mypy app`
  - `python -m alembic upgrade head`
  - `python -m uvicorn app.main:app --reload`

### Local Windows workstation constraint
Windows Smart App Control blocks native extension DLLs that lack reputation. Known-good local pins: `pikepdf==9.4.2`, `sqlalchemy<2.1` (falls back to pure Python). If a new native dependency fails with "An Application Control policy has blocked this file", try an older release before anything else. Docker images are unaffected.

## Frontend (`apps/web`)
- Next.js App Router, TypeScript strict, Tailwind, Radix primitives.
- Colors only via tokens in `src/styles/tokens.css`; dark mode via `class` on `<html>`.
- Commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Root
- `make dev` runs the whole stack in Docker; `make test` runs all tests.
- Commit after each meaningful unit with a clear message.
