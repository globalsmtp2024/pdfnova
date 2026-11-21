import statistics
import sys
import time
import tracemalloc
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.files.render import render_page
from app.files.sniff import FileKind
from app.tools.base import InputFile, JobContext, Tool
from app.tools.organize.merge import MergeTool
from app.tools.organize.page_tools import (
    ExtractPagesTool,
    OrganizeTool,
    RemovePagesTool,
    RotateTool,
    SplitTool,
)
from tests.pdf_factory import make_image_pdf, make_pdf


def _input(path: Path, pages: int) -> InputFile:
    return InputFile(path, path.name, FileKind.PDF, "application/pdf", path.stat().st_size, pages)


def _timed(action: Callable[[], Any], runs: int = 3) -> tuple[float, float]:
    durations: list[float] = []
    peak = 0
    for _ in range(runs):
        tracemalloc.start()
        started = time.perf_counter()
        action()
        durations.append(time.perf_counter() - started)
        peak = max(peak, tracemalloc.get_traced_memory()[1])
        tracemalloc.stop()
    return statistics.median(durations), peak / (1024 * 1024)


def _run(tool: Tool[Any], workdir: Path, inputs: list[InputFile], **options: Any) -> None:
    ctx = JobContext(workdir=workdir, inputs=inputs, options=tool.parse_options(options))
    ctx.scratch_dir.mkdir(parents=True, exist_ok=True)
    tool.run(ctx)


def main(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    hundred = [_input(make_pdf(root / f"m{index}.pdf", 10, f"M{index}"), 10) for index in range(10)]
    big = _input(make_pdf(root / "big.pdf", 300, "Big", outline=True), 300)
    huge = _input(make_pdf(root / "huge.pdf", 600, "Huge"), 600)
    images = _input(make_image_pdf(root / "images.pdf", pages=4, size=1600), 4)
    cases: list[tuple[str, Callable[[], Any]]] = [
        ("First-page thumbnail, 300-page PDF (256 px WebP)", lambda: render_page(str(big.path), 0, 256)),
        ("First-page thumbnail, 1600 px image page", lambda: render_page(str(images.path), 0, 256)),
        ("Merge 10 files, 100 pages", lambda: _run(MergeTool(), root / "w-merge", hundred)),
        ("Split 300 pages into 300 files", lambda: _run(SplitTool(), root / "w-each", [big], mode="each")),
        (
            "Split 300 pages every 10",
            lambda: _run(SplitTool(), root / "w-every", [big], mode="every", every=10),
        ),
        (
            "Split 300 pages by size (100 KB)",
            lambda: _run(SplitTool(), root / "w-size", [big], mode="size", max_size_mb=0.1),
        ),
        ("Rotate 300 pages", lambda: _run(RotateTool(), root / "w-rot", [big], angle=90)),
        ("Remove 150 of 300 pages", lambda: _run(RemovePagesTool(), root / "w-rem", [big], pages="odd")),
        ("Extract 50 of 300 pages", lambda: _run(ExtractPagesTool(), root / "w-ext", [big], pages="1-50")),
        (
            "Organize 300 pages reversed",
            lambda: _run(
                OrganizeTool(), root / "w-org", [big], pages=[{"page": n} for n in range(300, 0, -1)]
            ),
        ),
        ("Rotate 600 pages", lambda: _run(RotateTool(), root / "w-rot2", [huge], angle=180)),
    ]
    print("| Operation | Median of 3 | Peak Python heap |")
    print("|---|---|---|")
    for label, action in cases:
        seconds, megabytes = _timed(action)
        print(f"| {label} | {seconds * 1000:.0f} ms | {megabytes:.1f} MB |")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
