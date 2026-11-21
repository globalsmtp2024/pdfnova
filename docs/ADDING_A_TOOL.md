# Adding a tool

A tool is one Python module plus one entry in the web catalog. Everything else (uploads, sniffing, quotas, sandboxing, progress, downloads, retention) is handled by the platform.

## 1. Backend module

Create `apps/api/app/tools/<category>/<name>.py`:

```python
class RotateOptions(ToolOptions):
    angle: Literal[90, 180, 270] = 90
    pages: str | None = Field(default=None, max_length=500)


class RotateTool(Tool[RotateOptions]):
    slug = "rotate"
    name = "Rotate PDF"
    category = ToolCategory.EDIT
    summary = "Rotate all pages or just the ones you choose."
    input_spec = InputSpec(min_files=1, max_files=50, accepted_kinds=frozenset({FileKind.PDF}))
    options_schema = RotateOptions

    def run(self, ctx: JobContext[RotateOptions]) -> list[OutputFile]:
        ...
```

Rules:

- `slug` must match the web catalog slug exactly.
- `run` executes in a separate, resource-limited process. Read inputs from `ctx.inputs[i].path`, write outputs with `ctx.output_path(name)`, and return `OutputFile` entries. Multiple outputs are zipped automatically.
- Call `ctx.report(fraction, label)` for progress and `ctx.ensure_not_cancelled()` between expensive steps.
- Raise `ToolFailedError("plain-language message")` or `ToolInputError(message, hint=...)` for user-facing failures. Never put file contents in error messages.
- Validate option/input combinations in `validate_options_against_inputs` so problems surface before the job is queued.
- Gate paid features with `plan_requirements = PlanRequirement(features=frozenset({Feature.OCR}))`.
- External binaries are called with argument lists and timeouts, never shell strings.

The module is discovered automatically; there is no registry to edit.

## 2. Tests

Add `apps/api/tests/test_<slug>_tool.py`. Generate fixtures with `tests/pdf_factory.py`, run the tool directly through a `JobContext`, assert on real output (page text, rotation, sizes), and cover validation errors. Add at least one API-level test if the tool has unusual inputs.

## 3. Web catalog

The tool already exists in `apps/web/src/config/tools.ts`; it switches from "Coming soon" to live as soon as the API lists it. If it needs options, add a panel in `apps/web/src/components/tools/option-panels.tsx` and map its payload in `tool-workspace.tsx`.

## 4. Checklist

- `python -m pytest`, `ruff check`, `mypy app` pass
- `npm run lint`, `npm run typecheck`, `npm test` pass
- Any new dependency is permissively licensed and listed in `docs/LICENSES.md`
