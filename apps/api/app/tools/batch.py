from collections.abc import Callable
from typing import Any

from app.core.errors import AppError
from app.tools.base import InputFile, JobContext, OutputFile, ToolFailedError

FileHandler = Callable[[InputFile, int], list[OutputFile]]


def run_each(ctx: JobContext[Any], handler: FileHandler, label: str) -> list[OutputFile]:
    outputs: list[OutputFile] = []
    failures: list[tuple[str, str]] = []
    total = len(ctx.inputs)
    for index, item in enumerate(ctx.inputs):
        ctx.ensure_not_cancelled()
        ctx.report(index / max(total, 1) * 0.95, f"{label} {index + 1} of {total}")
        try:
            outputs.extend(handler(item, index))
        except (ToolFailedError, AppError) as exc:
            if total == 1:
                raise
            failures.append((item.original_name, exc.message))
    if not outputs:
        reason = failures[0][1] if failures else "No files could be processed."
        raise ToolFailedError(reason, code="all_files_failed")
    if failures:
        report = ctx.output_path("processing-report.txt")
        report.write_text(
            "Some files could not be processed:\n\n"
            + "\n".join(f"- {name}: {message}" for name, message in failures),
            encoding="utf-8",
        )
        outputs.append(OutputFile(path=report, filename=report.name, mime_type="text/plain"))
    ctx.report(1.0, "Packaging")
    return outputs
