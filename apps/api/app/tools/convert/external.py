import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

from pydantic import Field

from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.batch import run_each
from app.tools.pdfkit import output_pdf, pdf_name

OFFICE_TIMEOUT_SECONDS = 180
CHROME_TIMEOUT_SECONDS = 90
SOFFICE_NAMES = ("soffice", "libreoffice")
CHROME_NAMES = ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome")
WINDOWS_SOFFICE = (r"C:\Program Files\LibreOffice\program\soffice.exe",)
WINDOWS_CHROME = (
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
)


def find_binary(env_name: str, names: tuple[str, ...], windows: tuple[str, ...] = ()) -> str | None:
    configured = os.environ.get(env_name)
    if configured and Path(configured).is_file():
        return configured
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    for candidate in windows:
        if Path(candidate).is_file():
            return candidate
    return None


def missing(tool: str, _install: str) -> ToolFailedError:
    return ToolFailedError(f"{tool} is not available on this server yet.", code="converter_missing")


def office_to_pdf(source: Path, workdir: Path) -> Path:
    binary = find_binary("SOFFICE_BINARY", SOFFICE_NAMES, WINDOWS_SOFFICE)
    if binary is None:
        raise missing("Office conversion", "")
    profile = Path(tempfile.mkdtemp(prefix="lo-profile-", dir=workdir))
    outdir = workdir / "converted"
    outdir.mkdir(parents=True, exist_ok=True)
    command = [
        binary,
        "--headless",
        "--norestore",
        "--nolockcheck",
        f"-env:UserInstallation={profile.as_uri()}",
        "--convert-to",
        "pdf",
        "--outdir",
        str(outdir),
        str(source),
    ]
    try:
        subprocess.run(command, capture_output=True, timeout=OFFICE_TIMEOUT_SECONDS, check=True)
    except subprocess.TimeoutExpired as exc:
        raise ToolFailedError("The document took too long to convert.", code="convert_timeout") from exc
    except subprocess.CalledProcessError as exc:
        raise ToolFailedError("The document could not be converted.", code="convert_failed") from exc
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    produced = outdir / f"{source.stem}.pdf"
    if not produced.is_file():
        raise ToolFailedError("The document could not be converted.", code="convert_failed")
    return produced


class OfficeToPdfOptions(ToolOptions):
    pass


class WordToPdfTool(Tool[OfficeToPdfOptions]):
    slug = "word-to-pdf"
    name = "Word to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Convert Word documents to PDF with their layout intact."
    input_spec = InputSpec(
        min_files=1,
        max_files=20,
        accepted_kinds=frozenset({FileKind.DOCX, FileKind.DOC, FileKind.ODT, FileKind.RTF}),
    )
    options_schema = OfficeToPdfOptions
    seconds_per_mb = 3.0
    kinds_label = "Word"

    def run(self, ctx: JobContext[OfficeToPdfOptions]) -> list[OutputFile]:
        return convert_office(ctx)


class PowerPointToPdfTool(Tool[OfficeToPdfOptions]):
    slug = "powerpoint-to-pdf"
    name = "PowerPoint to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Convert presentations to PDF, one slide per page."
    input_spec = InputSpec(
        min_files=1,
        max_files=20,
        accepted_kinds=frozenset({FileKind.PPTX, FileKind.PPT, FileKind.ODP}),
    )
    options_schema = OfficeToPdfOptions
    seconds_per_mb = 3.0

    def run(self, ctx: JobContext[OfficeToPdfOptions]) -> list[OutputFile]:
        return convert_office(ctx)


class ExcelToPdfTool(Tool[OfficeToPdfOptions]):
    slug = "excel-to-pdf"
    name = "Excel to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Convert spreadsheets to PDF."
    input_spec = InputSpec(
        min_files=1,
        max_files=20,
        accepted_kinds=frozenset({FileKind.XLSX, FileKind.XLS, FileKind.ODS, FileKind.CSV}),
    )
    options_schema = OfficeToPdfOptions
    seconds_per_mb = 3.0

    def run(self, ctx: JobContext[OfficeToPdfOptions]) -> list[OutputFile]:
        return convert_office(ctx)


def convert_office(ctx: JobContext[OfficeToPdfOptions]) -> list[OutputFile]:
    def handle(item: InputFile, _: int) -> list[OutputFile]:
        suffix = item.path.suffix or ".bin"
        staged = ctx.scratch_dir / f"input-{abs(hash(item.path))}{suffix}"
        shutil.copyfile(item.path, staged)
        produced = office_to_pdf(staged, ctx.scratch_dir)
        target = ctx.output_path(pdf_name(item.stem, "document"))
        shutil.copyfile(produced, target)
        return [output_pdf(target)]

    return run_each(ctx, handle, "Converting file")


class HtmlToPdfOptions(ToolOptions):
    page_size: Literal["A4", "Letter", "Legal", "A3"] = "A4"
    landscape: bool = False
    margin_mm: float = Field(default=12.0, ge=0, le=50)
    print_backgrounds: bool = True


def render_html(source: Path, target: Path, options: HtmlToPdfOptions, workdir: Path) -> None:
    binary = find_binary("CHROMIUM_BINARY", CHROME_NAMES, WINDOWS_CHROME)
    if binary is None:
        raise missing("HTML conversion", "")
    short_root = Path("/tmp") if Path("/tmp").is_dir() else None
    profile = Path(tempfile.mkdtemp(prefix="pnc-", dir=short_root))
    environment = {**os.environ, "TMPDIR": str(profile)}
    command = [
        binary,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-extensions",
        "--disable-dev-shm-usage",
        "--no-pdf-header-footer",
        "--allow-file-access-from-files=false",
        "--host-resolver-rules=MAP * ~NOTFOUND",
        f"--user-data-dir={profile}",
        f"--print-to-pdf={target}",
        source.as_uri(),
    ]
    try:
        subprocess.run(
            command, capture_output=True, timeout=CHROME_TIMEOUT_SECONDS, check=True, env=environment
        )
    except subprocess.TimeoutExpired as exc:
        raise ToolFailedError("The page took too long to render.", code="convert_timeout") from exc
    except subprocess.CalledProcessError as exc:
        raise ToolFailedError("The page could not be rendered.", code="convert_failed") from exc
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    if not target.is_file():
        raise ToolFailedError("The page could not be rendered.", code="convert_failed")


PAGE_CSS = {"A4": "A4", "Letter": "letter", "Legal": "legal", "A3": "A3"}


def inject_print_rules(source: Path, workdir: Path, options: HtmlToPdfOptions) -> Path:
    text = source.read_text(encoding="utf-8", errors="replace")
    orientation = "landscape" if options.landscape else "portrait"
    rules = (
        f"<style>@page{{size:{PAGE_CSS[options.page_size]} {orientation};margin:{options.margin_mm}mm}}"
        + ("html{-webkit-print-color-adjust:exact}" if options.print_backgrounds else "")
        + "</style>"
    )
    staged = workdir / "page.html"
    staged.write_text(rules + text, encoding="utf-8")
    return staged


class HtmlToPdfTool(Tool[HtmlToPdfOptions]):
    slug = "html-to-pdf"
    limit_address_space = False
    name = "HTML to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Render an HTML file to PDF in a sandboxed browser, without loading outside resources."
    input_spec = InputSpec(min_files=1, max_files=10, accepted_kinds=frozenset({FileKind.HTML}))
    options_schema = HtmlToPdfOptions
    seconds_per_mb = 3.0

    def run(self, ctx: JobContext[HtmlToPdfOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            staged = inject_print_rules(item.path, ctx.scratch_dir, options)
            target = ctx.output_path(pdf_name(item.stem, "page"))
            render_html(staged, target, options, ctx.scratch_dir)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Rendering page")


class UrlToPdfTool(Tool[HtmlToPdfOptions]):
    slug = "url-to-pdf"
    limit_address_space = False
    name = "URL to PDF"
    category = ToolCategory.CONVERT_TO_PDF
    summary = "Import a web page by its address and save it as PDF. Images and styles hosted elsewhere are not loaded."
    input_spec = InputSpec(min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.HTML}))
    options_schema = HtmlToPdfOptions
    seconds_per_mb = 3.0

    def run(self, ctx: JobContext[HtmlToPdfOptions]) -> list[OutputFile]:
        return HtmlToPdfTool().run(ctx)
