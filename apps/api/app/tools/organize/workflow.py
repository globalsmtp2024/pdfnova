import json
import re
import shutil
from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


MAX_NODES = 12
MAX_FANOUT = 4
NODE_ID = r"^[A-Za-z][A-Za-z0-9_\-]{0,30}$"


class WorkflowNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=NODE_ID)
    tool: str = Field(min_length=1, max_length=64)
    options: dict[str, Any] = Field(default_factory=dict)
    label: str = Field(default="", max_length=40)


class WorkflowEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str = Field(pattern=NODE_ID)
    target: str = Field(pattern=NODE_ID)


class WorkflowOptions(ToolOptions):
    steps: list[str] | None = Field(default=None, min_length=1, max_length=MAX_STEPS)
    nodes: list[WorkflowNode] | None = Field(default=None, min_length=1, max_length=MAX_NODES)
    edges: list[WorkflowEdge] = Field(default_factory=list, max_length=MAX_NODES * MAX_FANOUT)

    @model_validator(mode="after")
    def _one_shape(self) -> "WorkflowOptions":
        if (self.steps is None) == (self.nodes is None):
            raise ValueError("Send either a list of steps or a graph of nodes.")
        if self.nodes is not None:
            graph_order(self.nodes, self.edges)
        return self


def graph_order(nodes: Sequence[WorkflowNode], edges: Sequence[WorkflowEdge]) -> list[str]:
    ids = [node.id for node in nodes]
    if len(set(ids)) != len(ids):
        raise ValueError("Every node needs a unique id.")
    children: dict[str, list[str]] = {node_id: [] for node_id in ids}
    indegree = dict.fromkeys(ids, 0)
    for edge in edges:
        if edge.source not in children or edge.target not in children:
            raise ValueError("An edge points at a node that does not exist.")
        if edge.source == edge.target:
            raise ValueError("A node cannot feed itself.")
        children[edge.source].append(edge.target)
        indegree[edge.target] += 1
    if any(len(targets) > MAX_FANOUT for targets in children.values()):
        raise ValueError(f"A node can feed at most {MAX_FANOUT} branches.")
    ready = [node_id for node_id in ids if indegree[node_id] == 0]
    order: list[str] = []
    while ready:
        current = ready.pop(0)
        order.append(current)
        for target in children[current]:
            indegree[target] -= 1
            if indegree[target] == 0:
                ready.append(target)
    if len(order) != len(ids):
        raise ValueError("The workflow contains a loop.")
    return order


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


def plan_steps(options: WorkflowOptions) -> list[tuple[str, dict[str, Any]]]:
    if options.steps is not None:
        return [parse_step(line) for line in options.steps]
    return [(node.tool, node.options) for node in options.nodes or []]


def as_input(output: OutputFile) -> InputFile:
    return InputFile(
        path=output.path,
        original_name=output.filename,
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=output.path.stat().st_size,
        page_count=None,
    )


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
        for slug, step_options in plan_steps(options):
            check_step(slug).parse_options(step_options)

    def run(self, ctx: JobContext[WorkflowOptions]) -> list[OutputFile]:
        if ctx.options.nodes is not None:
            return self.run_graph(ctx, ctx.options.nodes, ctx.options.edges)
        return self.run_linear(ctx)

    def run_step(
        self,
        ctx: JobContext[WorkflowOptions],
        slug: str,
        step_options: dict[str, Any],
        inputs: list[InputFile],
        folder: str,
        report: Any,
    ) -> list[OutputFile]:
        tool = check_step(slug)
        parsed = tool.parse_options(step_options)
        infos = [InputFileInfo(f.original_name, f.size_bytes, f.kind, f.page_count) for f in inputs]
        tool.validate_inputs(infos, parsed)
        step_dir = ctx.workdir / folder
        step_dir.mkdir(parents=True, exist_ok=True)
        step_ctx = JobContext(
            workdir=step_dir,
            inputs=inputs,
            options=parsed,
            reporter=report,
            is_cancelled=ctx.is_cancelled,
        )
        return tool.run(step_ctx)

    def run_graph(
        self, ctx: JobContext[WorkflowOptions], nodes: list[WorkflowNode], edges: list[WorkflowEdge]
    ) -> list[OutputFile]:
        order = graph_order(nodes, edges)
        by_id = {node.id: node for node in nodes}
        parents: dict[str, list[str]] = {node.id: [] for node in nodes}
        has_children: set[str] = set()
        for edge in edges:
            parents[edge.target].append(edge.source)
            has_children.add(edge.source)
        results: dict[str, list[OutputFile]] = {}
        total = len(order)
        for number, node_id in enumerate(order):
            ctx.ensure_not_cancelled()
            node = by_id[node_id]
            if parents[node_id]:
                feeding: list[OutputFile] = []
                for parent in parents[node_id]:
                    feeding.extend(
                        output for output in results[parent] if output.mime_type == "application/pdf"
                    )
                if not feeding:
                    raise ToolFailedError(
                        f"The step before “{node.tool}” did not produce a PDF.", code="workflow_broken"
                    )
                current = [as_input(output) for output in feeding]
            else:
                current = list(ctx.inputs)

            def report(fraction: float, label: str, base: int = number) -> None:
                ctx.report((base + fraction) / total, f"Step {base + 1} of {total}: {label}")

            results[node_id] = self.run_step(
                ctx, node.tool, node.options, current, f"node-{node_id}-{node.tool}", report
            )
        leaves = [node_id for node_id in order if node_id not in has_children]
        outputs: list[OutputFile] = []
        taken: set[str] = set()
        for node_id in leaves:
            label = re.sub(r"[^A-Za-z0-9_\-]", "", by_id[node_id].label or node_id) or node_id
            for output in results[node_id]:
                filename = output.filename
                if filename in taken or len(leaves) > 1:
                    filename = f"{label}-{filename}"
                counter = 1
                while filename in taken:
                    counter += 1
                    filename = f"{label}-{counter}-{output.filename}"
                taken.add(filename)
                if filename != output.filename:
                    target = ctx.output_path(filename)
                    shutil.copyfile(output.path, target)
                    outputs.append(OutputFile(path=target, filename=filename, mime_type=output.mime_type))
                else:
                    outputs.append(output)
        return outputs

    def run_linear(self, ctx: JobContext[WorkflowOptions]) -> list[OutputFile]:
        steps = plan_steps(ctx.options)
        current: list[InputFile] = list(ctx.inputs)
        outputs: list[OutputFile] = []
        total = len(steps)
        for number, (slug, step_options) in enumerate(steps):
            ctx.ensure_not_cancelled()

            def report(fraction: float, label: str, base: int = number) -> None:
                ctx.report((base + fraction) / total, f"Step {base + 1} of {total}: {label}")

            outputs = self.run_step(ctx, slug, step_options, current, f"step-{number + 1}-{slug}", report)
            pdfs = [output for output in outputs if output.mime_type == "application/pdf"]
            if number < total - 1:
                if not pdfs:
                    raise ToolFailedError(
                        f"Step {number + 1} ({slug}) did not produce a PDF for the next step.",
                        code="workflow_broken",
                    )
                current = [as_input(output) for output in pdfs]
        return outputs
