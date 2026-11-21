# Performance

Measured with `python -m tests.perf_phase2 <scratch dir>` from `apps/api` on the development workstation: Intel Core (family 6 model 158), 12 logical CPUs, Windows 11, Python 3.11, pikepdf 9.4.2, pypdfium2 5.15.2. Tools run in-process here (no sandbox spawn), so production adds roughly 0.3–0.6 s of process start-up per job. Fixtures are generated text PDFs (reportlab) unless stated.

"Peak Python heap" comes from `tracemalloc` and excludes native qpdf and PDFium allocations, so it shows Python-side growth only, not total RSS.

## Phase 2, batch 1 (2026-11-20)

| Operation | Median of 3 | Peak Python heap | Target | Result |
|---|---|---|---|---|
| First-page thumbnail, 300-page PDF (256 px WebP) | 16 ms | 3.2 MB | < 300 ms | Met |
| First-page thumbnail, 1600 px image page | 34 ms | 0.3 MB | < 300 ms | Met |
| Merge 10 files, 100 pages | 230 ms | 0.1 MB | < 3 s | Met |
| Split 300 pages into 300 files | 4314 ms | 0.4 MB | < 5 s | Met |
| Split 300 pages every 10 | 1205 ms | 0.2 MB | < 5 s | Met |
| Split 300 pages by size (100 KB parts) | 1434 ms | 0.3 MB | | |
| Rotate 300 pages | 713 ms | 0.0 MB | near-instant | See note |
| Remove 150 of 300 pages | 740 ms | 0.2 MB | near-instant | See note |
| Extract 50 of 300 pages | 682 ms | 0.2 MB | near-instant | See note |
| Organize 300 pages reversed | 944 ms | 0.5 MB | | |
| Rotate 600 pages | 1578 ms | 0.1 MB | | Scales linearly |

Notes

- Rotate, remove and extract change only page dictionaries. Almost all of their time is the full rewrite in `save_pdf` (object streams and xref compression), which grows linearly with the document. Writing without object-stream generation would cut this, at the cost of larger outputs.
- Split into single pages is dominated by 300 separate saves. Each part copies only the objects its page needs.
- Split by size uses a binary search per part, so it costs about log2(n) trial saves per part rather than one per page.

Not yet measured: 200 MB inputs and peak RSS under the sandbox's rlimits on Linux. These need the Docker worker and will be added with Compress, the first tool where image-heavy throughput matters.
