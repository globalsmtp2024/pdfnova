# Third-party licenses

PDFNova is closed-source commercial software. Policy: only permissive (MIT, BSD, Apache-2.0, ISC, HPND, Unlicense) or weak-copyleft, file-level (MPL-2.0) components. **No GPL, LGPL-linked-statically, AGPL or SSPL components**, in code, binaries or bundled services. MPL-2.0 components are used unmodified; any modification to an MPL file must be published.

Versions are those verified in this repository on 2026-11-20. Re-run the license check whenever dependencies change.

## Backend runtime (Python)

| Package | Version | License |
|---|---|---|
| fastapi | 0.165.0 | MIT |
| uvicorn | 0.54.0 | BSD-3-Clause |
| pydantic / pydantic-settings | 2.14.3 / 2.16.3 | MIT |
| email-validator | 2.4.0 | Unlicense |
| SQLAlchemy | 2.0.58 | MIT |
| alembic | 1.20.1 | MIT |
| aiosqlite | 0.22.1 | MIT |
| asyncpg | 0.32.0 | Apache-2.0 |
| arq | 0.28.0 | MIT |
| redis (client) | 5.3.1 | MIT |
| argon2-cffi | 25.1.0 | MIT |
| PyJWT | 2.15.1 | MIT |
| pyotp | 2.12.1 | MIT |
| structlog | 26.1.0 | MIT OR Apache-2.0 |
| httpx | 0.28.1 | BSD-3-Clause |
| boto3 | 1.44.6 | Apache-2.0 |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause |
| prometheus-client | 0.26.0 | Apache-2.0 AND BSD-2-Clause |
| sentry-sdk | 2.75.0 | MIT |
| python-multipart | 0.0.34 | Apache-2.0 |
| filetype | 1.2.0 | MIT |
| pikepdf | 9.4.2 (local) / <11 | MPL-2.0 |
| pypdf | 7.1.1 | BSD-3-Clause |
| pypdfium2 (bundles PDFium) | 5.15.2 | Apache-2.0 / BSD-3-Clause; PDFium is BSD-3-Clause |
| Pillow | 13.0.0 | MIT-CMU (HPND) |
| fonttools | 4.68.0 | MIT |
| uharfbuzz (bundles HarfBuzz) | 0.57.0 | Apache-2.0; HarfBuzz is MIT ("Old MIT") |

## Added in the second build queue

| Package | License | Use |
|---|---|---|
| pyHanko | MIT | Certificate signing and verification |
| rembg | MIT | Background removal (u2netp model prefetched at image build) |
| onnxruntime | MIT | Runs the background removal model |
| python-pptx | MIT | PDF to PowerPoint |
| regex | Apache-2.0 | Redaction patterns with match timeouts |
| @xyflow/react | MIT | Workflow builder canvas |
| fflate | MIT | In-browser zip for batch and private mode |
| pdf-lib | MIT | In-browser private mode PDF operations |
| Chromium, fonts-noto | BSD-3-Clause, OFL-1.1 | HTML and URL to PDF, multilingual rendering |

## Backend development and tests

| Package | Version | License |
|---|---|---|
| reportlab | 5.1.0 | BSD-3-Clause |
| hypothesis | 6.170.17 | MPL-2.0 (unmodified, test-only) |
| pytest / pytest-asyncio / pytest-cov | 9.2.0 / 1.5.0 / 5.0.0 | MIT / Apache-2.0 / MIT |
| coverage | 7.6.1 | Apache-2.0 |
| moto | 5.2.5 | Apache-2.0 |
| respx | 0.23.1 | BSD-3-Clause |
| ruff | 0.17.5 | MIT |
| mypy | 2.4.1 | MIT |

## Frontend runtime (npm)

| Package | Version | License |
|---|---|---|
| next | 16.4.6 | MIT |
| react / react-dom | 19.3.0 | MIT |
| @radix-ui/react-dialog, react-slot, react-accordion, react-tabs, react-tooltip | 1.3.1, 1.5.0, 1.3.1, 1.2.1, 1.4.1 | MIT |
| next-intl | 4.15.1 | MIT |
| @next/mdx, @mdx-js/loader, @mdx-js/react | 16.4.6, 3.1.1, 3.1.1 | MIT |
| remark-gfm | 4.0.1 | MIT |
| cmdk | 1.1.1 | MIT |
| @dnd-kit/core, sortable, utilities | 6.3.1, 10.0.0, 3.2.2 | MIT |
| pdfjs-dist | 6.5.438 | Apache-2.0 |
| @tanstack/react-query | 5.108.0 | MIT |
| zustand | 5.1.0 | MIT |
| motion | 14.14.0 | MIT |
| lucide-react | 1.76.0 | ISC |
| next-themes | 0.4.6 | MIT |
| sonner | 2.0.8 | MIT |
| clsx / tailwind-merge | 2.1.1 / 3.7.0 | MIT |
| class-variance-authority | 0.7.1 | Apache-2.0 |

## Frontend development (npm)

tailwindcss 4.3.3 (MIT), @tailwindcss/turbopack (MIT), typescript 5.9.3 (Apache-2.0), eslint 9 and eslint-config-next (MIT), prettier and prettier-plugin-tailwindcss (MIT), vitest 5.1.1 (MIT), @playwright/test 1.65.1 (Apache-2.0), @vitejs/plugin-react (MIT), jsdom (MIT), @testing-library/* (MIT), @types/* (MIT).

## Fonts

Inter, Plus Jakarta Sans, JetBrains Mono: SIL Open Font License 1.1, self-hosted at build time by `next/font`. DejaVu and Noto fonts in the API image: Bitstream Vera license and OFL 1.1.

Fonts bundled in `apps/api/app/assets/fonts/` for text drawn into PDFs (page numbers, watermarks). Each family folder holds its `OFL.txt`. Source: google/fonts repository, variable fonts instanced to static Regular (wght 400) and Bold (wght 700) with fontTools; only subsets of the glyphs actually used are embedded in output PDFs. Bidirectional ordering is our own implementation; python-bidi (LGPL) is deliberately not used.

| Family | Version | License | Files |
|---|---|---|---|
| Inter | 4.001 | SIL OFL 1.1 | Inter-Regular.ttf, Inter-Bold.ttf (opsz 14) |
| Noto Sans | 2.015 | SIL OFL 1.1 | NotoSans-Regular.ttf, NotoSans-Bold.ttf |
| Noto Serif | 2.015 | SIL OFL 1.1 | NotoSerif-Regular.ttf, NotoSerif-Bold.ttf |
| Noto Sans Mono | 2.014 | SIL OFL 1.1 | NotoSansMono-Regular.ttf, NotoSansMono-Bold.ttf |
| Noto Sans Arabic | 2.012 | SIL OFL 1.1 | NotoSansArabic-Regular.ttf, NotoSansArabic-Bold.ttf |
| Noto Nastaliq Urdu | 3.009 | SIL OFL 1.1 | NotoNastaliqUrdu-Regular.ttf, NotoNastaliqUrdu-Bold.ttf |

## System binaries in images

| Binary | License | Use |
|---|---|---|
| qpdf | Apache-2.0 | Output validation in tests (`qpdf --check`), repair and linearization. Installed locally via winget (12.4.2). |
| Tesseract OCR + language data | Apache-2.0 | OCR (Phase 3) |
| LibreOffice (office-worker image only) | MPL-2.0 | Office to PDF, run as a separate process |
| tini | MIT | Init process |

Explicitly excluded: Ghostscript (AGPL), MuPDF / PyMuPDF (AGPL), unpaper (GPL-2.0), pngquant (GPL-3.0), Poppler (GPL).

## Infrastructure services (docker-compose)

| Service | License | Notes |
|---|---|---|
| PostgreSQL 17 | PostgreSQL License | |
| Valkey 9.0 | BSD-3-Clause | Chosen over Redis 7.4+, which is RSAL/SSPL |
| SeaweedFS 4.51 | Apache-2.0 | S3-compatible store; chosen over MinIO, which is AGPL-3.0 |
| nginx 1.27 | BSD-2-Clause | |

In production any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2) can replace SeaweedFS by changing environment variables.
