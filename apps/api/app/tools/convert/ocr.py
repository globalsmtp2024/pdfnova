import subprocess
import tempfile
from functools import lru_cache
from collections.abc import Sequence
from pathlib import Path

import pikepdf
import pypdfium2 as pdfium
from pydantic import Field

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
from app.tools.batch import run_each
from app.tools.convert.external import find_binary, missing
from app.tools.convert.text import validate_pages
from app.tools.pages import parse_page_ranges
from app.tools.pdfkit import output_pdf, pdf_name, save_pdf

TESSERACT_NAMES = ("tesseract",)
WINDOWS_TESSERACT = (r"C:\Program Files\Tesseract-OCR\tesseract.exe",)
PAGE_TIMEOUT_SECONDS = 120
MAX_OCR_PIXELS = 36_000_000


LANGUAGE_PATTERN = r"^[a-z]{3}(_[A-Za-z]+)?(\+[a-z]{3}(_[A-Za-z]+)?){0,3}$"


class OcrOptions(ToolOptions):
    language: str = Field(default="eng", pattern=LANGUAGE_PATTERN, max_length=60)
    dpi: int = Field(default=300, ge=150, le=400)
    pages: str | None = Field(default=None, max_length=2000)


@lru_cache(maxsize=1)
def installed_languages() -> tuple[str, ...]:
    binary = find_binary("TESSERACT_BINARY", TESSERACT_NAMES, WINDOWS_TESSERACT)
    if binary is None:
        return ()
    try:
        result = subprocess.run([binary, "--list-langs"], capture_output=True, text=True, timeout=20, check=True)
    except (subprocess.SubprocessError, OSError):
        return ()
    names = [line.strip() for line in result.stdout.splitlines()[1:] if line.strip()]
    return tuple(sorted(name for name in names if name != "osd"))


def check_language(language: str) -> None:
    available = installed_languages()
    unknown = [code for code in language.split("+") if code not in available]
    if unknown and available:
        raise ToolFailedError(
            f"The language {unknown[0]} is not installed. Installed: {', '.join(available)}.",
            code="ocr_language_missing",
        )


def recognise(binary: str, image: Path, base: Path, language: str) -> Path:
    command = [binary, str(image), str(base), "-l", language, "pdf"]
    try:
        subprocess.run(command, capture_output=True, timeout=PAGE_TIMEOUT_SECONDS, check=True)
    except subprocess.TimeoutExpired as exc:
        raise ToolFailedError("A page took too long to recognise.", code="ocr_timeout") from exc
    except subprocess.CalledProcessError as exc:
        raise ToolFailedError(
            "Text recognition failed. The selected language may not be installed.", code="ocr_failed"
        ) from exc
    produced = base.with_suffix(".pdf")
    if not produced.is_file():
        raise ToolFailedError("Text recognition produced no output.", code="ocr_failed")
    return produced


class OcrPdfTool(Tool[OcrOptions]):
    slug = "ocr"
    name = "OCR PDF"
    category = ToolCategory.OPTIMIZE
    summary = "Make scanned PDFs searchable and selectable with English and Urdu recognition."
    input_spec = InputSpec(
        min_files=1,
        max_files=5,
        accepted_kinds=frozenset({FileKind.PDF, FileKind.IMAGE}),
        allow_encrypted_pdf=True,
    )
    options_schema = OcrOptions
    seconds_per_page = 3.0

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: OcrOptions) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[OcrOptions]) -> list[OutputFile]:
        options = ctx.options
        binary = find_binary("TESSERACT_BINARY", TESSERACT_NAMES, WINDOWS_TESSERACT)
        if binary is None:
            raise missing("Text recognition", "")
        check_language(options.language)

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            work = Path(tempfile.mkdtemp(prefix="ocr-", dir=ctx.scratch_dir))
            parts: list[Path] = []
            if item.kind is FileKind.IMAGE:
                parts.append(recognise(binary, item.path, work / "page-0", options.language))
            else:
                document = pdfium.PdfDocument(str(item.path))
                try:
                    selection = parse_page_ranges(options.pages, len(document))
                    scale = options.dpi / 72
                    for position, index in enumerate(selection):
                        ctx.ensure_not_cancelled()
                        ctx.report(position / len(selection), f"Recognising page {index + 1}")
                        page = document[index]
                        width, height = page.get_size()
                        effective = min(scale, (MAX_OCR_PIXELS / max(width * height, 1)) ** 0.5)
                        image = page.render(scale=effective).to_pil().convert("RGB")
                        page.close()
                        source = work / f"page-{position}.png"
                        image.save(source, format="PNG", dpi=(options.dpi, options.dpi))
                        parts.append(recognise(binary, source, work / f"out-{position}", options.language))
                finally:
                    document.close()
            with pikepdf.new() as merged:
                for part in parts:
                    with pikepdf.open(part) as piece:
                        merged.pages.extend(piece.pages)
                target = ctx.output_path(pdf_name(f"{item.stem}-searchable", "searchable"))
                save_pdf(merged, target)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Recognising file")
