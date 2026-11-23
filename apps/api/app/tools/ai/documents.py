import csv
import io
import json
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

import pdfplumber
import pikepdf
import pypdfium2 as pdfium
from pydantic import Field

from app.ai.provider import Provider, parse_json_block, provider_for
from app.ai.safety import GUARD, clean_answer, untrusted
from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.text.geometry import page_geometry
from app.text.overlay import OverlayDocument, TextStyle
from app.tools.base import (
    InputFileInfo,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.convert.text import validate_pages
from app.tools.formula_guard import guarded_text
from app.tools.pages import parse_page_ranges
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf
from app.tools.security.redact import RedactOptions, redact_with

AI_SPEC = InputSpec(
    min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)
MAX_DOCUMENT_CHARS = 100_000
RTL_LANGUAGES = {"Urdu", "Arabic", "Persian"}
TRANSLATE_BATCH_LINES = 60
TRANSLATE_BATCH_CHARS = 6000
MAX_LINES_PER_PAGE = 400


def page_texts(path: Path, expression: str | None) -> list[tuple[int, str]]:
    try:
        document = pdfium.PdfDocument(str(path))
    except pdfium.PdfiumError as exc:
        raise ToolFailedError("This PDF could not be read.", code="pdf_unreadable") from exc
    try:
        result: list[tuple[int, str]] = []
        for index in parse_page_ranges(expression, len(document)):
            page = document[index]
            textpage = page.get_textpage()
            text = textpage.get_text_bounded().replace("\r\n", "\n").strip()
            textpage.close()
            page.close()
            if text:
                result.append((index + 1, text))
        return result
    finally:
        document.close()


def tagged(pages: list[tuple[int, str]], budget: int = MAX_DOCUMENT_CHARS) -> str:
    parts: list[str] = []
    used = 0
    for number, text in pages:
        chunk = f"[Page {number}]\n{text}\n"
        if used + len(chunk) > budget:
            chunk = chunk[: max(budget - used, 0)]
        if chunk:
            parts.append(chunk)
        used += len(chunk)
        if used >= budget:
            break
    return "\n".join(parts)


def require_text(pages: list[tuple[int, str]]) -> None:
    if not pages:
        raise ToolFailedError(
            "No selectable text was found. Run OCR PDF first if this is a scan.", code="no_text"
        )


class SummarizeOptions(ToolOptions):
    length: Literal["short", "medium", "long"] = "medium"
    style: Literal["bullets", "paragraphs"] = "bullets"
    language: str = Field(default="the same language as the document", max_length=40)
    focus: str = Field(default="", max_length=300)
    pages: str | None = Field(default=None, max_length=2000)


LENGTHS = {"short": "about 5 lines", "medium": "about 15 lines", "long": "a detailed multi-section summary"}


class SummarizeTool(Tool[SummarizeOptions]):
    slug = "ai-summarize"
    name = "AI summarizer"
    category = ToolCategory.AI
    summary = "Summarise a long PDF with page references, using the shared allowance or your own key."
    input_spec = AI_SPEC
    options_schema = SummarizeOptions
    uses_ai = True
    seconds_per_page = 0.3

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: SummarizeOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[SummarizeOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        ctx.report(0.1, "Reading text")
        pages = page_texts(item.path, options.pages)
        require_text(pages)
        provider = provider_for(ctx)
        focus = f" Focus on: {options.focus}." if options.focus else ""
        system = f"You summarise documents. {GUARD}"
        prompt = (
            f"Summarise the document below in {options.language}, {LENGTHS[options.length]}, "
            f"as {options.style}. Cite page numbers like (p. 3) after each point.{focus}\n\n"
            + untrusted(tagged(pages))
        )
        ctx.report(0.4, "Summarising")
        answer = clean_answer(provider.complete(system, prompt))
        target = ctx.output_path(f"{item.stem}-summary.md")
        target.write_text(answer.strip() + "\n", encoding="utf-8")
        return [OutputFile(path=target, filename=target.name, mime_type="text/markdown")]


class ChatOptions(ToolOptions):
    questions: list[str] = Field(min_length=1, max_length=10)
    pages: str | None = Field(default=None, max_length=2000)


WORD = re.compile(r"\w{3,}", re.UNICODE)


def pick_relevant(pages: list[tuple[int, str]], questions: list[str], budget: int) -> list[tuple[int, str]]:
    if sum(len(text) for _, text in pages) <= budget:
        return pages
    wanted = {word.lower() for question in questions for word in WORD.findall(question)}
    scored = sorted(
        pages,
        key=lambda entry: sum(1 for word in WORD.findall(entry[1].lower()) if word in wanted),
        reverse=True,
    )
    chosen: list[tuple[int, str]] = []
    used = 0
    for number, text in scored:
        if used + len(text) > budget:
            continue
        chosen.append((number, text))
        used += len(text)
    return sorted(chosen)


class ChatWithPdfTool(Tool[ChatOptions]):
    slug = "ai-chat"
    name = "Chat with PDF"
    category = ToolCategory.AI
    summary = "Ask questions about a PDF and get answers with page citations."
    input_spec = AI_SPEC
    options_schema = ChatOptions
    uses_ai = True
    seconds_per_page = 0.3

    def validate_options_against_inputs(self, files: Sequence[InputFileInfo], options: ChatOptions) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[ChatOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        pages = page_texts(item.path, options.pages)
        require_text(pages)
        provider = provider_for(ctx)
        relevant = pick_relevant(pages, options.questions, MAX_DOCUMENT_CHARS)
        numbered = "\n".join(f"{index}. {question}" for index, question in enumerate(options.questions, 1))
        system = f"You answer questions about a document. {GUARD}"
        prompt = (
            "Answer each numbered question using only the document. After every claim cite the page like "
            "[p. 4]. If the document does not contain the answer, say so.\n\n"
            f"Questions:\n{numbered}\n\n{untrusted(tagged(relevant))}"
        )
        ctx.report(0.4, "Asking")
        answer = clean_answer(provider.complete(system, prompt))
        target = ctx.output_path(f"{item.stem}-answers.md")
        target.write_text(answer.strip() + "\n", encoding="utf-8")
        return [OutputFile(path=target, filename=target.name, mime_type="text/markdown")]


class TranslateOptions(ToolOptions):
    target_language: Literal[
        "Urdu", "English", "Arabic", "Hindi", "Spanish", "French", "German", "Turkish", "Chinese", "Persian"
    ] = "Urdu"
    pages: str | None = Field(default=None, max_length=2000)


def translate_batch(provider: Provider, lines: list[str], target: str) -> list[str]:
    system = f"You translate text faithfully. {GUARD}"
    prompt = (
        f"Translate each string in this JSON array into {target}. Return only a JSON array of the same "
        f"length with the translations in the same order.\n{json.dumps(lines, ensure_ascii=False)}"
    )
    translated = parse_json_block(provider.complete(system, prompt))
    if not isinstance(translated, list) or len(translated) != len(lines):
        raise ToolFailedError("The translation came back in an unexpected shape.", code="ai_bad_response")
    return [str(entry) for entry in translated]


class TranslatePdfTool(Tool[TranslateOptions]):
    slug = "ai-translate"
    name = "Translate PDF"
    category = ToolCategory.AI
    summary = "Translate a PDF in place: each text line is replaced by its translation."
    input_spec = AI_SPEC
    options_schema = TranslateOptions
    uses_ai = True
    seconds_per_page = 1.5

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: TranslateOptions
    ) -> None:
        validate_pages(files, options.pages)

    def run(self, ctx: JobContext[TranslateOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        provider = provider_for(ctx)
        located: list[tuple[int, float, float, float, float, str]] = []
        with pdfplumber.open(item.path) as plumber:
            selection = parse_page_ranges(options.pages, len(plumber.pages))
            for index in selection:
                page = plumber.pages[index]
                if page.rotation:
                    continue
                for line in page.extract_text_lines(strip=True, return_chars=False)[:MAX_LINES_PER_PAGE]:
                    if line["text"].strip():
                        located.append(
                            (index, line["x0"], line["x1"], line["top"], line["bottom"], line["text"])
                        )
        if not located:
            raise ToolFailedError(
                "No selectable, upright text was found. Run OCR PDF first if this is a scan.", code="no_text"
            )
        translations: list[str] = []
        batch: list[str] = []
        size = 0
        for number, entry in enumerate(located):
            ctx.ensure_not_cancelled()
            if batch and (
                len(batch) >= TRANSLATE_BATCH_LINES or size + len(entry[5]) > TRANSLATE_BATCH_CHARS
            ):
                translations.extend(translate_batch(provider, batch, options.target_language))
                batch, size = [], 0
                ctx.report(number / len(located) * 0.8, "Translating")
            batch.append(entry[5])
            size += len(entry[5])
        if batch:
            translations.extend(translate_batch(provider, batch, options.target_language))
        rtl = options.target_language in RTL_LANGUAGES
        with open_pdf(item) as pdf:
            overlay = OverlayDocument(pdf, prefix="Tr")
            for (index, x0, x1, top, bottom, _), text in zip(located, translations, strict=True):
                page = pdf.pages[index]
                geometry = page_geometry(page)
                width, height = x1 - x0, bottom - top
                y = geometry.bottom + geometry.height - bottom
                blank = f"q 1 1 1 rg {x0 - 1:.3f} {y - 1:.3f} {width + 2:.3f} {height + 2:.3f} re f Q\n"
                page.contents_add(pikepdf.Stream(pdf, b"q\n"), prepend=True)
                page.contents_add(pikepdf.Stream(pdf, b"\nQ\n" + blank.encode("ascii")), prepend=False)
                style = TextStyle(font="noto-sans", size=max(height * 0.8, 5.0), align="left")
                stamp = overlay.text_stamp(text, style)
                scale = min(1.0, width / stamp.width) if stamp.width else 1.0
                tx = x1 - stamp.width * scale if rtl else x0
                ty = y + (height - stamp.height * scale) / 2
                overlay.place(page, stamp, (scale, 0.0, 0.0, scale, tx, ty))
            overlay.finalize()
            target = ctx.output_path(pdf_name(f"{item.stem}-{options.target_language.lower()}", "translated"))
            save_pdf(pdf, target)
        return [output_pdf(target)]


class SmartRedactOptions(ToolOptions):
    names: bool = True
    emails: bool = True
    phones: bool = True
    ids: bool = True
    addresses: bool = False
    financial: bool = True
    extra: str = Field(default="", max_length=300)
    dpi: int = Field(default=200, ge=100, le=300)


CATEGORY_LABELS = {
    "names": "people's names",
    "emails": "email addresses",
    "phones": "phone numbers",
    "ids": "ID, passport and social security numbers",
    "addresses": "postal addresses",
    "financial": "bank account, card and amount details",
}
MAX_SMART_PATTERNS = 100


class SmartRedactTool(Tool[SmartRedactOptions]):
    slug = "ai-smart-redact"
    name = "Smart redact"
    category = ToolCategory.AI
    summary = "Find sensitive details such as names, emails and numbers, then permanently black them out."
    input_spec = AI_SPEC
    options_schema = SmartRedactOptions
    uses_ai = True
    seconds_per_page = 1.0

    def run(self, ctx: JobContext[SmartRedactOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        pages = page_texts(item.path, None)
        require_text(pages)
        wanted = [label for key, label in CATEGORY_LABELS.items() if getattr(options, key)]
        if options.extra:
            wanted.append(options.extra)
        if not wanted:
            raise ToolInputError("Choose at least one kind of detail to find.")
        provider = provider_for(ctx)
        system = f"You find sensitive details in documents. {GUARD}"
        prompt = (
            "List every exact string in the document that is one of these: "
            + "; ".join(wanted)
            + ". Copy each string exactly as it appears. Return only a JSON array of strings.\n\n"
            + untrusted(tagged(pages))
        )
        ctx.report(0.3, "Finding sensitive details")
        found = parse_json_block(provider.complete(system, prompt))
        strings = sorted({str(entry).strip() for entry in found if str(entry).strip()}, key=len, reverse=True)
        strings = [entry for entry in strings if 2 <= len(entry) <= 200][:MAX_SMART_PATTERNS]
        if not strings:
            raise ToolFailedError("No sensitive details were found.", code="nothing_found")
        patterns = [re.escape(entry) for entry in strings]
        ctx.report(0.5, "Redacting")
        return redact_with(
            ctx,
            RedactOptions(
                boxes=[], patterns=patterns, ignore_case=False, dpi=options.dpi, strip_metadata=True
            ),
        )


class ExtractDataOptions(ToolOptions):
    fields: list[str] = Field(default_factory=list, max_length=50)
    output: Literal["json", "csv", "both"] = "both"


def parse_fields(lines: list[str]) -> list[tuple[str, str]]:
    parsed: list[tuple[str, str]] = []
    for line in lines:
        name, _, description = line.partition(":")
        if name.strip():
            parsed.append((name.strip()[:60], description.strip()[:200]))
    return parsed


class ExtractDataTool(Tool[ExtractDataOptions]):
    slug = "ai-extract-data"
    name = "Extract structured data"
    category = ToolCategory.AI
    summary = "Pull invoice numbers, dates, totals or any fields you name out of a PDF as JSON or CSV."
    input_spec = AI_SPEC
    options_schema = ExtractDataOptions
    uses_ai = True
    seconds_per_page = 0.4

    def run(self, ctx: JobContext[ExtractDataOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        pages = page_texts(item.path, None)
        require_text(pages)
        provider = provider_for(ctx)
        fields = parse_fields(options.fields)
        if fields:
            spec = "\n".join(f"- {name}: {description}" for name, description in fields)
            task = f"Extract these fields as a flat JSON object (use null when missing):\n{spec}"
        else:
            task = "Extract the key facts (dates, parties, identifiers, totals) as a flat JSON object."
        system = f"You extract structured data. {GUARD}"
        prompt = f"{task}\nReturn only the JSON object.\n\n{untrusted(tagged(pages))}"
        ctx.report(0.4, "Extracting")
        data = parse_json_block(provider.complete(system, prompt))
        if not isinstance(data, dict):
            raise ToolFailedError("The AI answer was not a set of fields.", code="ai_bad_response")
        outputs: list[OutputFile] = []
        if options.output in {"json", "both"}:
            target = ctx.output_path(f"{item.stem}-data.json")
            target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            outputs.append(OutputFile(path=target, filename=target.name, mime_type="application/json"))
        if options.output in {"csv", "both"}:
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(["field", "value"])
            for key, value in data.items():
                writer.writerow([key, "" if value is None else guarded_text(str(value))])
            target = ctx.output_path(f"{item.stem}-data.csv")
            target.write_text(buffer.getvalue(), encoding="utf-8")
            outputs.append(OutputFile(path=target, filename=target.name, mime_type="text/csv"))
        return outputs
