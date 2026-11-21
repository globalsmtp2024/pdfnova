# Phase 2 screenshot review

Twenty captures (5 tools × desktop light, desktop dark, 390 px light, 390 px dark Urdu), full page in this folder and the tool workspace alone in `workspace/`. Captured by `CAPTURE_SCREENSHOTS=1 npx playwright test e2e/phase2-screens.spec.ts` against a production build and the real API. All 20 workspace captures were reviewed by eye on 2026-11-20.

## Bugs found and fixed

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | Rotate, Organize | Pages rotated 90°/270° overflowed their portrait box, showing a blank strip | Rotated previews scale to 75 % so the whole page fits |
| 2 | All grids, light mode | White pages on a white grid had no visible edge | Strong border ring plus an inset so all four edges show |
| 3 | Urdu (RTL) | Page range "2, 4" displayed as "4 ,2" | `dir="ltr"` on range, ranges textarea, number and position inputs |
| 4 | Split, Urdu | File name template rendered scrambled by bidi | `dir="ltr"` on the template input |
| 5 | Split | Scissor marker on the last card of a row clipped by the scroll area and overlapping selected borders | Wider column gap and side padding, marker centred in the gap |
| 6 | Organize, Urdu | Undo and redo arrows not mirrored | `flip-rtl` on both icons |
| 7 | All grids | Some thumbnails stayed as numbered placeholders (server returned 500) | Root cause in local storage: `Path.resolve()` on Windows returned a different path while another request replaced the same file, failing the traversal guard. Guard is now lexical (`normpath`), cache reads fall back to re-rendering, duplicate cache writes are tolerated, and the client retries twice with backoff. Regression tests added. A probe run of all 20 captures logged zero thumbnail errors afterwards |
| 8 | Urdu tool pages | How-to steps, highlights and FAQ were English | Urdu content for every live tool, enforced by a CI test |

## Not bugs

- The site header and the mobile bottom tool bar appear over content in `workspace/` captures. Both are sticky elements caught by an element screenshot; on a real page they behave normally.
