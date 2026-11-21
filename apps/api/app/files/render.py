import asyncio
import contextlib
import io
import multiprocessing
import sys
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from pathlib import Path

MAX_PIXELS = 4_000_000
MIN_WIDTH = 64
MAX_WIDTH = 1024
WIDTH_STEP = 32
RENDER_TIMEOUT_SECONDS = 20
WORKER_MEMORY_MB = 1024


class RenderError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def purge_render_cache(work_root: Path, file_ids: list[str]) -> None:
    directory = work_root.resolve() / "render"
    for file_id in file_ids:
        for suffix in (".pdf", ".part"):
            (directory / f"{file_id}{suffix}").unlink(missing_ok=True)


def normalize_width(width: int) -> int:
    clamped = min(max(width, MIN_WIDTH), MAX_WIDTH)
    return max(MIN_WIDTH, round(clamped / WIDTH_STEP) * WIDTH_STEP)


def _limit_resources(memory_mb: int) -> None:
    if sys.platform.startswith("win"):
        return
    import resource

    limit = memory_mb * 1024 * 1024
    with contextlib.suppress(ValueError, OSError):
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))


def render_page(path: str, page_index: int, width: int, quality: int = 72) -> bytes:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(path)
    try:
        if page_index < 0 or page_index >= len(document):
            raise ValueError("page out of range")
        page = document[page_index]
        page_width, page_height = page.get_size()
        rotation = page.get_rotation()
        if rotation in (90, 270):
            page_width, page_height = page_height, page_width
        if page_width <= 0 or page_height <= 0:
            raise ValueError("empty page")
        scale = width / page_width
        if page_width * page_height * scale * scale > MAX_PIXELS:
            scale = (MAX_PIXELS / (page_width * page_height)) ** 0.5
        bitmap = page.render(scale=scale, may_draw_forms=True)
        image = bitmap.to_pil().convert("RGB")
        buffer = io.BytesIO()
        image.save(buffer, format="WEBP", quality=quality, method=4)
        page.close()
        return buffer.getvalue()
    finally:
        document.close()


class PageRenderer:
    def __init__(self, workers: int = 2, memory_mb: int = WORKER_MEMORY_MB):
        self._workers = workers
        self._memory_mb = memory_mb
        self._executor: ProcessPoolExecutor | None = None
        self._lock = asyncio.Lock()

    def _ensure(self) -> ProcessPoolExecutor:
        if self._executor is None:
            self._executor = ProcessPoolExecutor(
                max_workers=self._workers,
                mp_context=multiprocessing.get_context("spawn"),
                initializer=_limit_resources,
                initargs=(self._memory_mb,),
            )
        return self._executor

    def _reset(self) -> None:
        if self._executor is not None:
            self._executor.shutdown(wait=False, cancel_futures=True)
            self._executor = None

    async def render(self, path: str, page_index: int, width: int) -> bytes:
        loop = asyncio.get_running_loop()
        async with self._lock:
            executor = self._ensure()
        try:
            future = loop.run_in_executor(executor, render_page, path, page_index, normalize_width(width))
            return await asyncio.wait_for(future, timeout=RENDER_TIMEOUT_SECONDS)
        except TimeoutError as exc:
            async with self._lock:
                self._reset()
            raise RenderError("render_timeout", "This page took too long to render.") from exc
        except BrokenProcessPool as exc:
            async with self._lock:
                self._reset()
            raise RenderError("render_failed", "This page could not be rendered.") from exc
        except Exception as exc:
            raise RenderError("render_failed", "This page could not be rendered.") from exc

    def close(self) -> None:
        self._reset()
