import json
from collections.abc import Sequence
from typing import Any

from pydantic import Field

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputFileInfo,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.registry import get_registry

MAX_STEPS = 6
MAX_STEP_LINE = 4000


class WorkflowOptions(ToolOptions):
    steps: list[str] = Field(min_length=1, max_length=MAX_STEPS)


def parse_step(line: str) -> tuple[str, dict[str, Any]]:
    if len(line) > MAX_STEP_LINE:
        raise ToolInputError("A workflow step is too long.")
    slug, _, rest = line.strip().partition(" ")
    if not slug:
        raise ToolInputError("Write each step as: tool-name {optional JSON options}")
    options: dict[str, Any] = {}
    if rest.strip():
        try:
            parsed = json.loads(rest)
        except json.JSONDecodeError as exc:
            raise ToolInputError(f"The options of step “{slug}” are not valid JSON.") from exc
        if not isinstance(parsed, dict):
            raise ToolInputError(f"The options of step “{slug}” must be a JSON object.")
        options = parsed
    return slug, options


def check_step(slug: str) -> Tool[Any]:
    registry = get_registry()
    if slug not in registry:
        raise ToolInputError(f"There is no tool called “{slug}”.")
    tool = registry.get(slug)
    if slug == "workflow" or tool.uses_ai or tool.required_secrets or tool.accepted_secrets:
        raise ToolInputError(f"“{slug}” can't be used as a workflow step.")
    if FileKind.PDF not in tool.input_spec.accepted_kinds:
        raise ToolInputError(f"“{slug}” does not take PDF files, so it can't be a workflow step.")
    return tool


class WorkflowTool(Tool[WorkflowOptions]):
    slug = "workflow"
    name = "Workflow runner"
    category = ToolCategory.ORGANIZE
    summary = "Run several PDF tools one after another on the same files, in a single task."
    input_spec = InputSpec(
        min_files=1, max_files=20, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = WorkflowOptions
    seconds_per_page = 0.05

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: WorkflowOptions
    ) -> None:
        for line in options.steps:
            slug, step_options = parse_step(line)
            check_step(slug).parse_options(step_options)

    def run(self, ctx: JobContext[WorkflowOptions]) -> list[OutputFile]:
        steps = [parse_step(line) for line in ctx.options.steps]
        current: list[InputFile] = list(ctx.inputs)
        outputs: list[OutputFile] = []
        total = len(steps)
        for number, (slug, step_options) in enumerate(steps):
            ctx.ensure_not_cancelled()
            tool = check_step(slug)
            parsed = tool.parse_options(step_options)
            infos = [
                InputFileInfo(file.original_name, file.size_bytes, file.kind, file.page_count) for file in current
            ]
            tool.validate_inputs(infos, parsed)
            step_dir = ctx.workdir / f"step-{number + 1}-{slug}"
            step_dir.mkdir(parents=True, exist_ok=True)

            def report(fraction: float, label: str, base: int = number) -> None:
                ctx.report((base + fraction) / total, f"Step {base + 1} of {total}: {label}")

            step_ctx = JobContext(
                workdir=step_dir,
                inputs=current,
                options=parsed,
                reporter=report,
                is_cancelled=ctx.is_cancelled,
            )
            outputs = tool.run(step_ctx)
            pdfs = [output for output in outputs if output.mime_type == "application/pdf"]
            if number < total - 1:
                if not pdfs:
                    raise ToolFailedError(
                        f"Step {number + 1} ({slug}) did not produce a PDF for the next step.",
                        code="workflow_broken",
                    )
                current = [
                    InputFile(
                        path=output.path,
                        original_name=output.filename,
                        kind=FileKind.PDF,
                        mime_type="application/pdf",
                        size_bytes=output.path.stat().st_size,
                        page_count=None,
                    )
                    for output in pdfs
                ]
        return outputs
