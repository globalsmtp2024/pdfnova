import asyncio
import shutil
from dataclasses import dataclass
from pathlib import Path

from app.core.logging import get_logger
from app.files.render import purge_render_cache
from app.storage.base import Storage, task_prefix

log = get_logger(__name__)
ATTEMPTS = 3


@dataclass(frozen=True)
class ErasureReport:
    deleted_objects: int
    remaining_objects: int
    remaining_cache_files: int
    work_directory_left: bool

    @property
    def verified(self) -> bool:
        return not (self.remaining_objects or self.remaining_cache_files or self.work_directory_left)


def cache_files_left(work_root: Path, file_ids: list[str]) -> int:
    directory = work_root.resolve() / "render"
    return sum(
        1
        for file_id in file_ids
        for suffix in (".pdf", ".part")
        if (directory / f"{file_id}{suffix}").exists()
    )


async def erase_task_data(
    storage: Storage, work_root: Path, task_id: str, file_ids: list[str]
) -> ErasureReport:
    deleted = 0
    report = ErasureReport(0, 0, 0, False)
    for _ in range(ATTEMPTS):
        deleted += await asyncio.to_thread(storage.delete_prefix, task_prefix(task_id))
        purge_render_cache(work_root, file_ids)
        shutil.rmtree(work_root.resolve() / task_id, ignore_errors=True)
        report = ErasureReport(
            deleted_objects=deleted,
            remaining_objects=await asyncio.to_thread(storage.count_prefix, task_prefix(task_id)),
            remaining_cache_files=cache_files_left(work_root, file_ids),
            work_directory_left=(work_root.resolve() / task_id).exists(),
        )
        if report.verified:
            return report
    log.error(
        "erasure_not_verified",
        task_id=task_id,
        remaining_objects=report.remaining_objects,
        remaining_cache_files=report.remaining_cache_files,
    )
    return report


async def erase_prefix(storage: Storage, prefix: str) -> bool:
    for _ in range(ATTEMPTS):
        await asyncio.to_thread(storage.delete_prefix, prefix)
        if await asyncio.to_thread(storage.count_prefix, prefix) == 0:
            return True
    log.error("prefix_erasure_not_verified", prefix=prefix)
    return False
