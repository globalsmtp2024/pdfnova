# Lighthouse

Lighthouse 12.8.2, Playwright Chromium, production build (`next start`) on the Windows workstation, 2026-11-20. Built with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` so the canonical link matches the audited origin.

| Page | Form | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|---|
| Home `/` | Desktop | 76–99 | 100 | 96 | 100 |
| Home `/` | Mobile | 56–71 | 100 | 96 | 100 |
| Merge `/tools/merge` | Desktop | 82–97 | 100 | 96 | 100 |
| Merge `/tools/merge` | Mobile | 38–69 | 100 | 96 | 100 |

Ranges are across separate runs; performance varied widely between identical runs on this machine, so the numbers are indicative, not final.

## Fixed

- Hydration mismatch (React #418) on every page: `useSession` and `useAvailableTools` returned cached query data during hydration while the server rendered skeletons, so React discarded the server HTML and re-rendered the whole tree. Both hooks now report pending until hydration finishes (`src/lib/use-hydrated.ts`).
- Canonical failure: only caused by auditing localhost against the production `siteUrl`; the audit build sets `NEXT_PUBLIC_SITE_URL`.
- Motion library now loads its animation features lazily (`LazyMotion` + `m` components) instead of in the first-load bundle.

## Open

- Mobile performance is below 90. Largest Contentful Paint is a server-rendered text element whose time is almost entirely render delay behind first-load JavaScript. Next steps: median-of-5 measurement on a quiet machine or CI, then trim the shared client bundle (header, command palette, providers).
- Best practices 96: guest session probe logs a 401 for `/api/v1/auth/me` in the console.

## Mobile, median of 3 runs (2026-11-20, second pass)

| Page | Baseline perf | After pass 2 | LCP | TBT | CLS |
|---|---|---|---|---|---|
| Home | 65 | 68 | 4.5 s | 602 ms | 0 |
| Merge | 51 | not re-measured yet | 4.7 s (baseline) | 695 ms (baseline) | 0.30 (baseline, fix applied) |

Pass 2 changes: command palette and shortcuts dialog load on first use (`GlobalOverlays`), the hero glow that caused the 0.30 layout shift on tool pages is anchored to the top, below-the-fold sections and the footer use `content-visibility: auto` (`render-deferred`), and JetBrains Mono is no longer preloaded.

Still open, tracked as a background task: mobile performance is below 90. LCP is render delay behind framework JavaScript (about 1.4 s of scripting on a 4x throttled CPU) and style/layout of a large DOM. Next steps: re-measure Merge, trim client components in the header and hero, and drop prefetch of tool routes from above-the-fold links on mobile.