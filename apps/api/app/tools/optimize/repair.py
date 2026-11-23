import glob
import re
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import pikepdf
import pypdfium2 as pdfium

from app.core.config import get_settings
from app.files.sniff import FileKind
from app.tools.base import (
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.pdfkit import copy_document_info, new_pdf_from_pages, output_pdf, pdf_name, save_pdf

QPDF_TIMEOUT_SECONDS = 120
WINDOWS_QPDF_PATTERN = r"C:\Program Files\qpdf*\bin\qpdf.exe"
REPORT_NAME = "repair-report.txt"
MAX_DETAIL_LINES = 40
RASTER_DPI = 150
MAX_TREE_DEPTH = 64
RECOVERABLE_ERRORS = (
    pikepdf.PdfError,
    KeyError,
    ValueError,
    TypeError,
    RuntimeError,
    AttributeError,
    IndexError,
)
OBJECT_HEADER = re.compile(rb"(\d+)\s+(\d+)\s+obj\b")
PAGE_TYPE = re.compile(rb"/Type\s*/Page(?![A-Za-z])")
PAGES_TYPE = re.compile(rb"/Type\s*/Pages(?![A-Za-z])")
COUNT_ENTRY = re.compile(rb"/Count\s+(\d+)")

WARNING_FINDINGS: list[tuple[tuple[str, ...], str]] = [
    (
        ("reconstructing xref", "xref not found", "file is damaged", "invalid xref", "xref table"),
        "Rebuilt the cross-reference table.",
    ),
    (
        ("stream length", "recover stream length", "expected endstream", "stream keyword"),
        "Fixed streams whose declared /Length was wrong.",
    ),
    (("expected endobj",), "Repaired objects that were missing their endobj marker."),
    (("trailer",), "Reconstructed the damaged trailer dictionary."),
]


class RepairOptions(ToolOptions):
    rasterize_unreadable_pages: bool = False


@dataclass
class PageEstimate:
    declared: int | None = None
    page_objects: int = 0
    pdfium: int | None = None
    clean: int | None = None

    @property
    def best(self) -> int:
        if self.clean is not None:
            return self.clean
        return max(self.declared or 0, self.page_objects, self.pdfium or 0)

    def describe(self) -> str:
        if self.clean is not None:
            return f"the document opens cleanly with {self.clean} pages"
        parts = []
        if self.declared is not None:
            parts.append(f"the page tree declares {self.declared}")
        parts.append(f"{self.page_objects} page objects were found in the file")
        if self.pdfium is not None:
            parts.append(f"a tolerant reader sees {self.pdfium}")
        return "; ".join(parts)


@dataclass
class Attempt:
    method: str
    path: Path
    warnings: list[str] = field(default_factory=list)
    lost_pages: list[int] = field(default_factory=list)
    rasterized_pages: list[int] = field(default_factory=list)
    page_count: int = 0


def qpdf_executable() -> str | None:
    configured = get_settings().qpdf_binary
    if configured:
        return configured if Path(configured).is_file() else shutil.which(configured)
    found = shutil.which("qpdf")
    if found:
        return found
    installed = sorted(glob.glob(WINDOWS_QPDF_PATTERN))
    return installed[-1] if installed else None


def _object_chunks(data: bytes) -> dict[int, bytes]:
    headers = list(OBJECT_HEADER.finditer(data))
    chunks: dict[int, bytes] = {}
    for position, match in enumerate(headers):
        end = headers[position + 1].start() if position + 1 < len(headers) else len(data)
        chunks[int(match.group(1))] = data[match.end() : end]
    return chunks


def _pdfium_page_count(source: Path) -> int | None:
    try:
        document = pdfium.PdfDocument(str(source))
    except pdfium.PdfiumError:
        return None
    try:
        return len(document)
    finally:
        document.close()


def estimate_pages(source: Path, data: bytes) -> PageEstimate:
    estimate = PageEstimate()
    chunks = _object_chunks(data)
    estimate.page_objects = sum(
        1 for chunk in chunks.values() if PAGE_TYPE.search(chunk) and not PAGES_TYPE.search(chunk)
    )
    declared = [
        int(found.group(1))
        for chunk in chunks.values()
        if PAGES_TYPE.search(chunk) and (found := COUNT_ENTRY.search(chunk))
    ]
    estimate.declared = max(declared) if declared else None
    estimate.pdfium = _pdfium_page_count(source)
    return estimate


def structural_findings(data: bytes) -> list[str]:
    findings: list[str] = []
    end_marker = data.rfind(b"%%EOF")
    if end_marker < 0:
        findings.append("The file ends abruptly; it looks truncated or was not fully downloaded.")
    else:
        trailing = data[end_marker + 5 :].strip()
        if trailing:
            findings.append(
                f"Found {len(trailing)} bytes of unexpected data after the end of the file; "
                "they were left out."
            )
    if b"startxref" not in data:
        findings.append("The pointer to the cross-reference table was missing.")
    if b"trailer" not in data and b"/XRef" not in data:
        findings.append("The trailer dictionary was missing; it was reconstructed from the document objects.")
    return findings


def warning_findings(warnings: list[str]) -> list[str]:
    findings: list[str] = []
    unmatched = 0
    for warning in warnings:
        lowered = warning.lower()
        matched = False
        for needles, finding in WARNING_FINDINGS:
            if any(needle in lowered for needle in needles):
                matched = True
                if finding not in findings:
                    findings.append(finding)
        unmatched += 0 if matched else 1
    if unmatched:
        findings.append(f"Corrected {unmatched} other low-level problems (listed under technical details).")
    return findings


def _clean_warnings(lines: list[str], source: Path) -> list[str]:
    cleaned: list[str] = []
    for line in lines:
        text = line.replace(str(source), "input").replace(source.name, "input").strip()
        text = text.removeprefix("WARNING: ").removeprefix("qpdf: ")
        if text and "operation succeeded with warnings" not in text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _clean_open(source: Path) -> int | None:
    try:
        with pikepdf.open(source) as pdf:
            if pdf.get_warnings():
                return None
            return len(pdf.pages)
    except pikepdf.PdfError:
        return None


def _qpdf_attempt(source: Path, scratch: Path) -> Attempt | None:
    executable = qpdf_executable()
    if executable is None:
        return None
    target = scratch / "qpdf.pdf"
    try:
        result = subprocess.run(
            [executable, "--", str(source), str(target)],
            capture_output=True,
            text=True,
            timeout=QPDF_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode not in (0, 3) or not target.is_file():
        return None
    warnings = _clean_warnings((result.stderr + "\n" + result.stdout).splitlines(), source)
    return Attempt("qpdf structural recovery", target, warnings)


def _pikepdf_attempt(source: Path, scratch: Path) -> Attempt | None:
    target = scratch / "pikepdf.pdf"
    try:
        with pikepdf.open(source) as pdf:
            warnings = [str(warning) for warning in pdf.get_warnings()]
            pdf.save(target)
    except pikepdf.PdfError:
        return None
    return Attempt("object-level rebuild", target, _clean_warnings(warnings, source))


def _pypdf_attempt(source: Path, scratch: Path) -> Attempt | None:
    from pypdf import PdfReader, PdfWriter
    from pypdf.errors import PyPdfError

    target = scratch / "pypdf.pdf"
    lost: list[int] = []
    try:
        reader = PdfReader(str(source), strict=False)
        writer = PdfWriter()
        total = len(reader.pages)
        for index in range(total):
            try:
                writer.add_page(reader.pages[index])
            except (PyPdfError, KeyError, ValueError, TypeError, AttributeError):
                lost.append(index + 1)
        if not writer.pages:
            return None
        with target.open("wb") as handle:
            writer.write(handle)
    except (PyPdfError, OSError, KeyError, ValueError, TypeError, AttributeError):
        return None
    return Attempt("lenient object recovery", target, [], lost)


def _pdfium_attempt(source: Path, scratch: Path, rasterize: bool) -> Attempt | None:
    target = scratch / "pdfium.pdf"
    try:
        document = pdfium.PdfDocument(str(source))
    except pdfium.PdfiumError:
        return None
    attempt = Attempt("page-level salvage", target)
    rebuilt = pdfium.PdfDocument.new()
    try:
        for index in range(len(document)):
            try:
                rebuilt.import_pages(document, [index])
                continue
            except pdfium.PdfiumError:
                pass
            if rasterize and _rasterize_into(document, index, rebuilt, scratch):
                attempt.rasterized_pages.append(index + 1)
            else:
                attempt.lost_pages.append(index + 1)
        if len(rebuilt) == 0:
            return None
        rebuilt.save(str(target))
    finally:
        rebuilt.close()
        document.close()
    return attempt


def _rasterize_into(
    document: pdfium.PdfDocument, index: int, rebuilt: pdfium.PdfDocument, scratch: Path
) -> bool:
    image_pdf = scratch / f"raster-{index}.pdf"
    try:
        page = document[index]
        image = page.render(scale=RASTER_DPI / 72).to_pil().convert("RGB")
        page.close()
        image.save(image_pdf, format="PDF", resolution=float(RASTER_DPI))
        single = pdfium.PdfDocument(str(image_pdf))
    except (pdfium.PdfiumError, OSError, ValueError):
        return False
    try:
        rebuilt.import_pages(single)
        return True
    except pdfium.PdfiumError:
        return False
    finally:
        single.close()


def _restore_root(pdf: pikepdf.Pdf) -> bool:
    root = pdf.trailer.get("/Root")
    if isinstance(root, pikepdf.Dictionary) and "/Pages" in root:
        return False
    for candidate in pdf.objects:
        if (
            isinstance(candidate, pikepdf.Dictionary)
            and candidate.get("/Type") == pikepdf.Name.Catalog
            and "/Pages" in candidate
        ):
            pdf.trailer.Root = candidate
            return True
    return False


def _qpdf_check_passes(target: Path) -> bool:
    executable = qpdf_executable()
    if executable is None:
        return True
    try:
        result = subprocess.run(
            [executable, "--check", "--", str(target)],
            capture_output=True,
            text=True,
            timeout=QPDF_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def _verified_page_count(target: Path) -> int:
    if not _qpdf_check_passes(target):
        return 0
    try:
        with pikepdf.open(target) as check:
            if check.get_warnings() or check.check():
                return 0
            return len(check.pages)
    except RECOVERABLE_ERRORS:
        return 0


def _page_slots(
    node: pikepdf.Object, seen: set[tuple[int, int]], depth: int = 0
) -> list[pikepdf.Object | None]:
    kids = node.get("/Kids") if isinstance(node, pikepdf.Dictionary) else None
    if not isinstance(kids, pikepdf.Array) or depth > MAX_TREE_DEPTH:
        return []
    slots: list[pikepdf.Object | None] = []
    for position in range(len(kids)):
        kid = kids[position]
        if not isinstance(kid, pikepdf.Dictionary):
            slots.append(None)
            continue
        if kid.is_indirect and kid.objgen in seen:
            continue
        if kid.is_indirect:
            seen.add(kid.objgen)
        if kid.get("/Type") == pikepdf.Name.Pages or "/Kids" in kid:
            slots.extend(_page_slots(kid, seen, depth + 1))
        elif kid.get("/Type") == pikepdf.Name.Page or "/Contents" in kid:
            slots.append(kid)
        else:
            slots.append(None)
    return slots


def _save_direct(pdf: pikepdf.Pdf, target: Path) -> int:
    if len(pdf.pages) == 0:
        return 0
    save_pdf(pdf, target)
    return _verified_page_count(target)


def _save_fresh(pdf: pikepdf.Pdf, target: Path) -> int:
    fresh, _ = new_pdf_from_pages(pdf, range(len(pdf.pages)))
    with fresh:
        save_pdf(fresh, target)
    return _verified_page_count(target)


def _save_walked(pdf: pikepdf.Pdf, target: Path, attempt: Attempt) -> int:
    root = pdf.trailer.get("/Root")
    pages = root.get("/Pages") if isinstance(root, pikepdf.Dictionary) else None
    if pages is None:
        return 0
    lost: list[int] = []
    with pikepdf.new() as fresh:
        for number, slot in enumerate(_page_slots(pages, set()), start=1):
            try:
                if slot is None:
                    raise ValueError
                fresh.pages.append(pikepdf.Page(slot))
            except (pikepdf.PdfError, ValueError, TypeError, RuntimeError):
                lost.append(number)
        if len(fresh.pages) == 0:
            return 0
        copy_document_info(pdf, fresh)
        save_pdf(fresh, target)
    count = _verified_page_count(target)
    if count:
        attempt.lost_pages = lost
    return count


def _finalize(attempt: Attempt, target: Path) -> bool:
    stages: list[tuple[str | None, Callable[[pikepdf.Pdf], int]]] = [
        (None, lambda pdf: _save_direct(pdf, target)),
        ("Rebuilt the document catalog and page tree in a fresh file.", lambda pdf: _save_fresh(pdf, target)),
        (
            "Rebuilt the page tree, skipping page entries that point at missing objects.",
            lambda pdf: _save_walked(pdf, target, attempt),
        ),
    ]
    try:
        with pikepdf.open(attempt.path) as pdf:
            if _restore_root(pdf):
                attempt.warnings.append("Restored the missing document catalog reference.")
            for note, stage in stages:
                try:
                    attempt.page_count = stage(pdf)
                except RECOVERABLE_ERRORS:
                    attempt.page_count = 0
                if attempt.page_count > 0:
                    if note:
                        attempt.warnings.append(note)
                    return True
    except RECOVERABLE_ERRORS:
        return False
    return False


def _page_list(numbers: list[int]) -> str:
    if len(numbers) == 1:
        return f"page {numbers[0]}"
    return "pages " + ", ".join(str(number) for number in numbers[:-1]) + f" and {numbers[-1]}"


def summarize(attempt: Attempt, expected: int, findings: list[str]) -> str:
    if not findings and attempt.page_count >= expected and not attempt.lost_pages:
        return f"No problems found. All {attempt.page_count} pages were saved as a clean copy."
    lead = " ".join(findings[:2]) if findings else "Repaired the document structure."
    recovered = attempt.page_count - len(attempt.rasterized_pages)
    parts = [lead]
    if attempt.page_count >= expected and not attempt.lost_pages:
        parts.append(f"Recovered all {attempt.page_count} pages.")
    else:
        total = max(expected, attempt.page_count + len(attempt.lost_pages))
        missing = total - attempt.page_count
        sentence = f"Recovered {attempt.page_count} of {total} pages"
        if attempt.lost_pages and len(attempt.lost_pages) == missing:
            sentence += f"; {_page_list(attempt.lost_pages)} could not be recovered."
        else:
            sentence += f"; {missing} {'page' if missing == 1 else 'pages'} could not be recovered."
        parts.append(sentence)
    if attempt.rasterized_pages:
        parts.append(
            f"{_page_list(attempt.rasterized_pages).capitalize()} had to be rebuilt as images "
            f"({recovered} pages kept their original text and vector content)."
        )
    return " ".join(parts)


def build_report(
    attempt: Attempt, estimate: PageEstimate, findings: list[str], summary: str, tried: list[str]
) -> str:
    lines = ["Repair report", "", f"Result: {summary}", "", f"Recovery method: {attempt.method}"]
    if len(tried) > 1:
        lines.append(f"Methods tried: {', '.join(tried)}")
    lines.append(f"Pages in the repaired file: {attempt.page_count}")
    lines.append(f"Expected pages: {estimate.best} ({estimate.describe()})")
    if attempt.lost_pages:
        lines.append(f"Pages that could not be recovered: {', '.join(map(str, attempt.lost_pages))}")
    if attempt.rasterized_pages:
        lines.append(
            "Pages rebuilt as images (text in them is no longer selectable): "
            + ", ".join(map(str, attempt.rasterized_pages))
        )
    lines += ["", "Problems found and fixed:"]
    lines += [f"- {finding}" for finding in findings] or ["- No problems found."]
    if attempt.warnings:
        lines += ["", "Technical details:"]
        lines += [f"- {warning}" for warning in attempt.warnings[:MAX_DETAIL_LINES]]
        if len(attempt.warnings) > MAX_DETAIL_LINES:
            lines.append(f"- ... and {len(attempt.warnings) - MAX_DETAIL_LINES} more")
    return "\n".join(lines) + "\n"


class RepairTool(Tool[RepairOptions]):
    slug = "repair"
    name = "Repair PDF"
    category = ToolCategory.OPTIMIZE
    summary = "Recover damaged or corrupted PDF files and get a report of what was fixed."
    input_spec = InputSpec(
        min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_damaged_pdf=True
    )
    options_schema = RepairOptions
    seconds_per_mb = 0.4
    seconds_per_page = 0.01

    def run(self, ctx: JobContext[RepairOptions]) -> list[OutputFile]:
        item = ctx.inputs[0]
        source = item.path
        data = source.read_bytes()
        ctx.report(0.05, "Examining the file")
        estimate = PageEstimate(clean=_clean_open(source))
        if estimate.clean is None:
            estimate = estimate_pages(source, data)
        findings = structural_findings(data)
        target = ctx.output_path(pdf_name(f"{item.stem}-repaired", "repaired"))
        strategies: list[tuple[str, Callable[[], Attempt | None]]] = [
            ("Rebuilding structure", lambda: _qpdf_attempt(source, ctx.scratch_dir)),
            ("Rebuilding objects", lambda: _pikepdf_attempt(source, ctx.scratch_dir)),
            ("Recovering objects leniently", lambda: _pypdf_attempt(source, ctx.scratch_dir)),
            (
                "Salvaging pages",
                lambda: _pdfium_attempt(source, ctx.scratch_dir, ctx.options.rasterize_unreadable_pages),
            ),
        ]
        best: Attempt | None = None
        tried: list[str] = []
        for position, (label, strategy) in enumerate(strategies):
            ctx.ensure_not_cancelled()
            ctx.report(0.1 + 0.2 * position, label)
            attempt = strategy()
            if attempt is None:
                continue
            tried.append(attempt.method)
            candidate = ctx.scratch_dir / f"candidate-{position}.pdf"
            if not _finalize(attempt, candidate):
                continue
            if best is None or attempt.page_count > best.page_count:
                best = attempt
                shutil.copyfile(candidate, target)
            if attempt.page_count >= estimate.best and not attempt.lost_pages:
                break
        if best is None:
            raise ToolFailedError(
                "Nothing could be recovered from this file. It is too badly damaged to rebuild.",
                code="repair_failed",
            )
        findings += [finding for finding in warning_findings(best.warnings) if finding not in findings]
        summary = summarize(best, estimate.best, findings)
        report = ctx.output_path(REPORT_NAME)
        report.write_text(build_report(best, estimate, findings, summary, tried), encoding="utf-8")
        ctx.report(1.0, summary)
        return [output_pdf(target), OutputFile(path=report, filename=REPORT_NAME, mime_type="text/plain")]
