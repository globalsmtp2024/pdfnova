from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any, ClassVar, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, ValidationError

from app.core.errors import ToolInputError
from app.files.sniff import FileKind


class ToolCategory(StrEnum):
    ORGANIZE = "organize"
    OPTIMIZE = "optimize"
    CONVERT_TO_PDF = "convert_to_pdf"
    CONVERT_FROM_PDF = "convert_from_pdf"
    EDIT = "edit"
    SECURITY = "security"
    AI = "ai"
    IMAGE = "image"


class ToolOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


OptionsT = TypeVar("OptionsT", bound=ToolOptions)


class InputSpec(BaseModel):
    model_config = ConfigDict(frozen=True)

    min_files: int = 1
    max_files: int = 1
    accepted_kinds: frozenset[FileKind] = frozenset({FileKind.PDF})
    max_file_bytes: int | None = None
    allow_encrypted_pdf: bool = False


class CostEstimate(BaseModel):
    seconds: float
    credits: int = 0


@dataclass(frozen=True)
class InputFileInfo:
    name: str
    size_bytes: int
    kind: FileKind
    page_count: int | None
    encrypted: bool = False


@dataclass(frozen=True)
class InputFile:
    path: Path
    original_name: str
    kind: FileKind
    mime_type: str
    size_bytes: int
    page_count: int | None
    file_id: str = ""
    encrypted: bool = False
    password: str | None = field(default=None, repr=False, compare=False)

    @property
    def stem(self) -> str:
        return Path(self.original_name).stem or "document"


@dataclass(frozen=True)
class OutputFile:
    path: Path
    filename: str
    mime_type: str


class JobCancelledError(Exception):
    pass


class ToolFailedError(Exception):
    def __init__(self, message: str, *, code: str = "tool_failed"):
        super().__init__(message)
        self.message = message
        self.code = code


ProgressReporter = Callable[[float, str], None]
CancelCheck = Callable[[], bool]


@dataclass
class JobContext(Generic[OptionsT]):
    workdir: Path
    inputs: list[InputFile]
    options: OptionsT
    reporter: ProgressReporter = field(default=lambda _fraction, _label: None)
    is_cancelled: CancelCheck = field(default=lambda: False)

    @property
    def output_dir(self) -> Path:
        path = self.workdir / "out"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def scratch_dir(self) -> Path:
        path = self.workdir / "scratch"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def output_path(self, filename: str) -> Path:
        return self.output_dir / safe_filename(filename)

    def report(self, fraction: float, label: str = "") -> None:
        self.reporter(min(max(fraction, 0.0), 1.0), label)

    def ensure_not_cancelled(self) -> None:
        if self.is_cancelled():
            raise JobCancelledError


_UNSAFE_FILENAME_CHARS = set('<>:"/\\|?*\0')


def safe_filename(name: str, fallback: str = "document") -> str:
    cleaned = "".join("_" if (c in _UNSAFE_FILENAME_CHARS or ord(c) < 32) else c for c in name).strip(" .")
    if not cleaned:
        cleaned = fallback
    if len(cleaned) > 180:
        stem, dot, suffix = cleaned.rpartition(".")
        cleaned = f"{stem[: 170 - len(suffix)]}.{suffix}" if dot and len(suffix) <= 10 else cleaned[:180]
    return cleaned


class Tool(ABC, Generic[OptionsT]):
    slug: ClassVar[str]
    name: ClassVar[str]
    category: ClassVar[ToolCategory]
    summary: ClassVar[str]
    input_spec: ClassVar[InputSpec]
    options_schema: ClassVar[type[ToolOptions]]
    uses_ai: ClassVar[bool] = False
    decrypt_inputs: ClassVar[bool] = True
    seconds_per_mb: ClassVar[float] = 0.05
    seconds_per_page: ClassVar[float] = 0.01

    def parse_options(self, raw: dict[str, Any] | None) -> OptionsT:
        try:
            parsed = self.options_schema.model_validate(raw or {})
        except ValidationError as exc:
            problems = "; ".join(
                f"{'.'.join(str(p) for p in err['loc']) or 'options'}: {err['msg']}" for err in exc.errors()
            )
            raise ToolInputError(
                f"Invalid options for {self.name}: {problems}",
                hint="Adjust the highlighted settings and try again.",
            ) from exc
        return parsed  # type: ignore[return-value]

    def validate_inputs(self, files: Sequence[InputFileInfo], options: OptionsT) -> None:
        spec = self.input_spec
        if len(files) < spec.min_files:
            noun = "file" if spec.min_files == 1 else "files"
            raise ToolInputError(
                f"{self.name} needs at least {spec.min_files} {noun}.",
                hint="Add more files and try again.",
            )
        if len(files) > spec.max_files:
            raise ToolInputError(
                f"{self.name} accepts at most {spec.max_files} files at once.",
                hint="Remove some files or split them into several tasks.",
            )
        for info in files:
            if info.kind not in spec.accepted_kinds:
                accepted = ", ".join(sorted(k.value.upper() for k in spec.accepted_kinds))
                raise ToolInputError(
                    f"This tool cannot open {info.kind.value.upper()} files.",
                    hint=f"Upload one of: {accepted}.",
                )
            if spec.max_file_bytes is not None and info.size_bytes > spec.max_file_bytes:
                raise ToolInputError("One of the files is larger than this tool allows.")
            if info.encrypted and not spec.allow_encrypted_pdf:
                raise ToolInputError(
                    "One of the PDFs is password-protected.",
                    hint="Unlock it first with the Unlock PDF tool, then try again.",
                )
        self.validate_options_against_inputs(files, options)

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: OptionsT) -> None:
        return None

    def estimate_cost(self, files: Sequence[InputFileInfo], options: OptionsT) -> CostEstimate:
        total_mb = sum(f.size_bytes for f in files) / (1024 * 1024)
        total_pages = sum(f.page_count or 0 for f in files)
        return CostEstimate(
            seconds=round(1.0 + total_mb * self.seconds_per_mb + total_pages * self.seconds_per_page, 1)
        )

    @abstractmethod
    def run(self, ctx: JobContext[OptionsT]) -> list[OutputFile]: ...

    @classmethod
    def describe(cls) -> dict[str, Any]:
        return {
            "slug": cls.slug,
            "name": cls.name,
            "category": cls.category.value,
            "summary": cls.summary,
            "input_spec": {
                "min_files": cls.input_spec.min_files,
                "max_files": cls.input_spec.max_files,
                "accepted_kinds": sorted(k.value for k in cls.input_spec.accepted_kinds),
                "max_file_bytes": cls.input_spec.max_file_bytes,
            },
            "options_schema": cls.options_schema.model_json_schema(),
            "uses_ai": cls.uses_ai,
        }
