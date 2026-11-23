import contextlib
import multiprocessing
import os
import sys
import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
from multiprocessing.connection import Connection
from multiprocessing.synchronize import Event
from pathlib import Path
from typing import Any, Protocol

from app.tools.base import InputFile, JobCancelledError, JobContext, OutputFile, ToolFailedError


@dataclass(frozen=True)
class SandboxLimits:
    timeout_seconds: int
    memory_mb: int
    max_output_bytes: int


@dataclass(frozen=True)
class SandboxRequest:
    tool_slug: str
    workdir: Path
    inputs: list[InputFile]
    options: dict[str, Any]
    limits: SandboxLimits
    secrets: dict[str, str] = field(default_factory=dict, repr=False, compare=False)


@dataclass(frozen=True)
class SandboxSuccess:
    outputs: list[OutputFile]


@dataclass(frozen=True)
class SandboxError:
    code: str
    message: str


SandboxResult = SandboxSuccess | SandboxError
ProgressCallback = Callable[[float, str], None]
CancelPoll = Callable[[], bool]


def _apply_resource_limits(limits: SandboxLimits) -> None:
    if sys.platform.startswith("win"):
        return
    import resource

    memory = limits.memory_mb * 1024 * 1024
    with contextlib.suppress(ValueError, OSError):
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
    cpu = limits.timeout_seconds + 5
    with contextlib.suppress(ValueError, OSError):
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
    with contextlib.suppress(ValueError, OSError):
        resource.setrlimit(resource.RLIMIT_FSIZE, (limits.max_output_bytes, limits.max_output_bytes))
    with contextlib.suppress(ValueError, OSError):
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    with contextlib.suppress(AttributeError, OSError):
        os.nice(5)


def _child_main(request: SandboxRequest, connection: Connection, cancel_event: Event) -> None:
    _apply_resource_limits(request.limits)
    os.environ["TMPDIR"] = str(request.workdir / "scratch")
    try:
        from app.tools.pdfkit import decrypt_inputs
        from app.tools.registry import get_registry

        tool = get_registry().get(request.tool_slug)
        options = tool.parse_options(request.options)
        last_sent = 0.0

        def report(fraction: float, label: str) -> None:
            nonlocal last_sent
            now = time.monotonic()
            if now - last_sent >= 0.2 or fraction >= 1.0:
                last_sent = now
                connection.send(("progress", fraction, label))

        context = JobContext(
            workdir=request.workdir,
            inputs=decrypt_inputs(request.inputs, request.workdir) if tool.decrypt_inputs else request.inputs,
            options=options,
            reporter=report,
            is_cancelled=cancel_event.is_set,
            secrets=dict(request.secrets),
        )
        request.secrets.clear()
        try:
            outputs = tool.run(context)
        finally:
            context.forget_secrets()
        for output in outputs:
            resolved = output.path.resolve()
            if request.workdir.resolve() not in resolved.parents or not resolved.is_file():
                raise ToolFailedError("The tool produced an invalid output file.", code="invalid_output")
        connection.send(("result", outputs))
    except JobCancelledError:
        connection.send(("error", "cancelled", "The task was cancelled."))
    except ToolFailedError as failure:
        connection.send(("error", failure.code, failure.message))
    except MemoryError:
        connection.send(("error", "resource_limit", "The document needs more memory than processing allows."))
    except Exception as exc:
        message = getattr(exc, "message", None)
        user_message = message if isinstance(message, str) else "The document could not be processed."
        code = getattr(exc, "code", "processing_error")
        connection.send(("error", code if isinstance(code, str) else "processing_error", user_message))
        connection.send(
            ("trace", "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-4000:])
        )
    finally:
        connection.close()


def run_in_sandbox(
    request: SandboxRequest,
    on_progress: ProgressCallback,
    cancel_requested: CancelPoll,
    on_trace: Callable[[str], None] | None = None,
) -> SandboxResult:
    context = multiprocessing.get_context("spawn")
    parent_connection, child_connection = context.Pipe(duplex=False)
    cancel_event = context.Event()
    process = context.Process(target=_child_main, args=(request, child_connection, cancel_event), daemon=True)
    process.start()
    child_connection.close()
    deadline = time.monotonic() + request.limits.timeout_seconds
    cancel_deadline: float | None = None
    result: SandboxResult | None = None
    next_cancel_poll = 0.0
    try:
        while result is None:
            now = time.monotonic()
            if now > deadline:
                result = SandboxError("timeout", "Processing took too long and was stopped.")
                break
            if cancel_deadline is None and now >= next_cancel_poll:
                next_cancel_poll = now + 1.0
                if cancel_requested():
                    cancel_event.set()
                    cancel_deadline = now + 3.0
            if cancel_deadline is not None and now > cancel_deadline:
                result = SandboxError("cancelled", "The task was cancelled.")
                break
            if _poll(parent_connection, 0.2):
                try:
                    message = parent_connection.recv()
                except (EOFError, OSError):
                    result = _crash_result(process)
                    break
                kind = message[0]
                if kind == "progress":
                    on_progress(float(message[1]), str(message[2]))
                elif kind == "result":
                    result = SandboxSuccess(outputs=list(message[1]))
                elif kind == "error":
                    result = SandboxError(str(message[1]), str(message[2]))
                    if _poll(parent_connection, 0.5):
                        with contextlib.suppress(EOFError, OSError):
                            trace = parent_connection.recv()
                            if trace[0] == "trace" and on_trace is not None:
                                on_trace(str(trace[1]))
            elif not process.is_alive():
                if _poll(parent_connection, 0):
                    continue
                result = _crash_result(process)
    finally:
        process.join(timeout=2)
        if process.is_alive():
            process.kill()
            process.join(timeout=5)
        parent_connection.close()
    return result


class _Pollable(Protocol):
    def poll(self, timeout: float | None = ...) -> bool: ...


def _poll(connection: _Pollable, timeout: float) -> bool:
    try:
        return connection.poll(timeout)
    except (EOFError, OSError):
        return False


def _crash_result(process: multiprocessing.process.BaseProcess) -> SandboxError:
    process.join(timeout=1)
    if process.exitcode is not None and process.exitcode < 0:
        return SandboxError("resource_limit", "Processing was stopped because it exceeded resource limits.")
    return SandboxError("processing_error", "The document could not be processed.")
