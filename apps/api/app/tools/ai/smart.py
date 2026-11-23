import csv
import datetime
import io
import json
import re
import uuid
from collections.abc import Sequence
from typing import Any, Literal

from pydantic import Field

from app.ai.provider import parse_json_block, provider_for
from app.ai.safety import GUARD, untrusted
from app.core.errors import ToolInputError
from app.tools.ai.documents import AI_SPEC, page_texts, require_text, tagged
from app.tools.base import (
    InputFileInfo,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
    safe_filename,
)
from app.tools.formula_guard import guarded_text
from app.tools.pdfkit import new_pdf_from_pages, open_pdf, output_pdf, pdf_name, save_pdf

SPLIT_PREVIEW_CHARS = 700
SPLIT_BUDGET_CHARS = 90_000
MAX_NAME = 70
DEFAULT_CATEGORIES = [
    "invoice",
    "receipt",
    "contract",
    "resume",
    "report",
    "letter",
    "form",
    "statement",
    "manual",
    "presentation",
    "other",
]


def leading_pages(item: Any, limit: int) -> list[tuple[int, str]]:
    with open_pdf(item) as pdf:
        count = len(pdf.pages)
    return page_texts(item.path, f"1-{min(count, limit)}")


def clean_title(value: object, fallback: str) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "", text)[:MAX_NAME].strip(" .")
    return text or fallback


class SmartSplitOptions(ToolOptions):
    hint: str = Field(default="", max_length=300)
    max_parts: int = Field(default=30, ge=2, le=100)


def validate_segments(raw: Any, count: int, max_parts: int) -> list[tuple[str, int, int]]:
    if not isinstance(raw, list) or not raw:
        raise ToolFailedError("The AI answer could not be understood.", code="ai_bad_response")
    parsed: list[tuple[str, int, int]] = []
    for position, entry in enumerate(raw[:max_parts], start=1):
        if not isinstance(entry, dict):
            continue
        try:
            start, end = int(entry["start"]), int(entry["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if not 1 <= start <= end <= count:
            continue
        parsed.append((clean_title(entry.get("title"), f"Part {position}"), start, end))
    parsed.sort(key=lambda segment: segment[1])
    starts: dict[int, str] = {}
    for title, start, _end in parsed:
        starts.setdefault(start, title)
    ordered = sorted(starts)
    if ordered and ordered[0] != 1:
        starts[1] = starts[ordered[0]]
        ordered = sorted(starts)
    segments = []
    for position, start in enumerate(ordered):
        end = ordered[position + 1] - 1 if position + 1 < len(ordered) else count
        segments.append((starts[start], start, end))
    if not segments:
        raise ToolFailedError("The AI answer could not be understood.", code="ai_bad_response")
    return segments


class SmartSplitTool(Tool[SmartSplitOptions]):
    slug = "ai-smart-split"
    name = "Smart split"
    category = ToolCategory.AI
    summary = "Let AI find where one document ends and the next begins, then split into named files."
    input_spec = AI_SPEC
    options_schema = SmartSplitOptions
    uses_ai = True
    seconds_per_page = 0.3

    def run(self, ctx: JobContext[SmartSplitOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        ctx.report(0.1, "Reading pages")
        pages = page_texts(item.path, None)
        require_text(pages)
        with open_pdf(item) as source:
            count = len(source.pages)
        if count < 2:
            raise ToolInputError("This PDF has only one page.")
        previews = [(number, text[:SPLIT_PREVIEW_CHARS]) for number, text in pages]
        provider = provider_for(ctx)
        hint = f" The user says the file contains: {options.hint}." if options.hint else ""
        system = f"You split combined PDF files into their separate documents. {GUARD}"
        prompt = (
            f"The document has {count} pages. Decide where each separate document starts and ends.{hint} "
            "Return only a JSON array like "
            '[{"title": "short descriptive title", "start": 1, "end": 3}] with consecutive, '
            "non-overlapping page ranges that cover every page.\n\n"
            + untrusted(tagged(previews, SPLIT_BUDGET_CHARS))
        )
        ctx.report(0.4, "Finding boundaries")
        segments = validate_segments(
            parse_json_block(provider.complete(system, prompt)), count, options.max_parts
        )
        if len(segments) < 2:
            raise ToolFailedError(
                "The AI found only one document, so nothing was split.", code="nothing_found"
            )
        outputs: list[OutputFile] = []
        plan: list[dict[str, Any]] = []
        with open_pdf(item) as source:
            for number, (title, start, end) in enumerate(segments, start=1):
                ctx.ensure_not_cancelled()
                ctx.report(0.5 + number / len(segments) * 0.45, f"Writing part {number}")
                part, _ = new_pdf_from_pages(source, range(start - 1, end), keep_outline=False)
                with part:
                    target = ctx.output_path(pdf_name(f"{number:02d}-{title}", f"part-{number}"))
                    save_pdf(part, target)
                outputs.append(output_pdf(target))
                plan.append({"file": target.name, "title": title, "start": start, "end": end})
        listing = ctx.output_path("split-plan.json")
        listing.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        outputs.append(OutputFile(path=listing, filename=listing.name, mime_type="application/json"))
        return outputs


class AiRenameOptions(ToolOptions):
    style: Literal["descriptive", "dated", "short"] = "descriptive"
    language: str = Field(default="the same language as the document", max_length=40)


class AiRenameTool(Tool[AiRenameOptions]):
    slug = "ai-rename"
    name = "AI rename"
    category = ToolCategory.AI
    summary = "Suggest a clear file name from the content and return the PDF under that name."
    input_spec = AI_SPEC
    options_schema = AiRenameOptions
    uses_ai = True
    seconds_per_page = 0.2

    def run(self, ctx: JobContext[AiRenameOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        pages = leading_pages(item, 3)
        require_text(pages)
        provider = provider_for(ctx)
        styles = {
            "descriptive": "a descriptive name such as 'Invoice - Acme Ltd - March 2025'",
            "dated": "start with the document date as YYYY-MM-DD, then a short description",
            "short": "at most four words",
        }
        system = f"You name files. {GUARD}"
        prompt = (
            f"Suggest a file name in {options.language}: {styles[options.style]}. "
            'Return only JSON like {"filename": "..."} without the extension, at most 70 characters.\n\n'
            + untrusted(tagged(pages, 20_000))
        )
        ctx.report(0.5, "Choosing a name")
        answer = parse_json_block(provider.complete(system, prompt, max_tokens=200))
        name = clean_title(answer.get("filename") if isinstance(answer, dict) else None, item.stem)
        target = ctx.output_path(pdf_name(safe_filename(name, item.stem), item.stem))
        target.write_bytes(item.path.read_bytes())
        return [output_pdf(target)]


class CategorizeOptions(ToolOptions):
    categories: list[str] = Field(default_factory=list, max_length=30)


class AiCategorizeTool(Tool[CategorizeOptions]):
    slug = "ai-categorize"
    name = "Auto-categorize"
    category = ToolCategory.AI
    summary = "Label a PDF as an invoice, contract, resume or another category with tags."
    input_spec = AI_SPEC
    options_schema = CategorizeOptions
    uses_ai = True
    seconds_per_page = 0.2

    def run(self, ctx: JobContext[CategorizeOptions]) -> list[OutputFile]:
        item = ctx.inputs[0]
        pages = leading_pages(item, 5)
        require_text(pages)
        allowed = [
            entry.strip()[:40] for entry in ctx.options.categories if entry.strip()
        ] or DEFAULT_CATEGORIES
        provider = provider_for(ctx)
        system = f"You classify documents. {GUARD}"
        prompt = (
            f"Choose exactly one category from: {', '.join(allowed)}. Also give up to 5 short lowercase tags "
            'and a confidence from 0 to 1. Return only JSON like {"category": "...", "confidence": 0.9, '
            '"tags": ["..."]}.\n\n' + untrusted(tagged(pages, 30_000))
        )
        ctx.report(0.5, "Classifying")
        answer = parse_json_block(provider.complete(system, prompt, max_tokens=300))
        if not isinstance(answer, dict):
            raise ToolFailedError("The AI answer could not be understood.", code="ai_bad_response")
        category = str(answer.get("category", "")).strip().lower()
        lowered = {entry.lower(): entry for entry in allowed}
        result = {
            "category": lowered.get(category, "other" if "other" in lowered else allowed[-1]),
            "confidence": max(0.0, min(float(answer.get("confidence") or 0), 1.0)),
            "tags": [str(tag).strip().lower()[:30] for tag in (answer.get("tags") or []) if str(tag).strip()][
                :5
            ],
        }
        target = ctx.output_path(f"{item.stem}-category.json")
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return [OutputFile(path=target, filename=target.name, mime_type="application/json")]


def escape_ics(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", r"\;").replace(",", "\\,").replace("\n", "\\n")


def fold_ics(line: str) -> list[str]:
    encoded = line.encode("utf-8")
    if len(encoded) <= 74:
        return [line]
    chunks: list[str] = []
    current = ""
    for char in line:
        if len((current + char).encode("utf-8")) > (74 if not chunks else 73):
            chunks.append(current)
            current = char
        else:
            current += char
    chunks.append(current)
    return [chunks[0], *(" " + chunk for chunk in chunks[1:])]


def build_ics(events: list[dict[str, Any]], title: str) -> str:
    stamp = datetime.datetime.now(datetime.UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PDFNova//Key dates//EN", "CALSCALE:GREGORIAN"]
    for event in events:
        day = datetime.date.fromisoformat(event["date"])
        page = event.get("page")
        description = f"{title} (page {page})" if page else title
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uuid.uuid4()}@pdfnova",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
            f"DTEND;VALUE=DATE:{day + datetime.timedelta(days=1):%Y%m%d}",
            f"SUMMARY:{escape_ics(event['label'])}",
            f"DESCRIPTION:{escape_ics(description)}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    folded: list[str] = []
    for line in lines:
        folded.extend(fold_ics(line))
    return "\r\n".join(folded) + "\r\n"


class KeyDatesOptions(ToolOptions):
    include_past: bool = True
    output: Literal["all", "ics", "json", "csv"] = "all"


class AiKeyDatesTool(Tool[KeyDatesOptions]):
    slug = "ai-key-dates"
    name = "Key dates extractor"
    category = ToolCategory.AI
    summary = "Find deadlines, due dates and renewals and export them as a calendar (.ics) file."
    input_spec = AI_SPEC
    options_schema = KeyDatesOptions
    uses_ai = True
    seconds_per_page = 0.4

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: KeyDatesOptions
    ) -> None:
        return None

    def run(self, ctx: JobContext[KeyDatesOptions]) -> list[OutputFile]:
        options = ctx.options
        item = ctx.inputs[0]
        pages = page_texts(item.path, None)
        require_text(pages)
        provider = provider_for(ctx)
        system = f"You extract dates from documents. {GUARD}"
        prompt = (
            "List every important date: deadlines, due dates, effective dates, renewals, expiries, meetings. "
            'Return only a JSON array like [{"date": "YYYY-MM-DD", "label": "what happens", "page": 1}]. '
            "Skip dates whose year is unknown.\n\n" + untrusted(tagged(pages))
        )
        ctx.report(0.4, "Finding dates")
        raw = parse_json_block(provider.complete(system, prompt))
        if not isinstance(raw, list):
            raise ToolFailedError("The AI answer could not be understood.", code="ai_bad_response")
        today = datetime.date.today()
        events: list[dict[str, Any]] = []
        for entry in raw[:200]:
            if not isinstance(entry, dict):
                continue
            try:
                day = datetime.date.fromisoformat(str(entry.get("date", ""))[:10])
            except ValueError:
                continue
            if not options.include_past and day < today:
                continue
            label = re.sub(r"\s+", " ", str(entry.get("label", ""))).strip()[:200]
            if not label:
                continue
            page = entry.get("page")
            events.append(
                {
                    "date": day.isoformat(),
                    "label": label,
                    "page": int(page) if isinstance(page, int) else None,
                }
            )
        if not events:
            raise ToolFailedError("No dates were found in this document.", code="nothing_found")
        events.sort(key=lambda event: event["date"])
        outputs: list[OutputFile] = []
        if options.output in {"all", "ics"}:
            target = ctx.output_path(f"{item.stem}-dates.ics")
            target.write_text(build_ics(events, item.stem), encoding="utf-8", newline="")
            outputs.append(OutputFile(path=target, filename=target.name, mime_type="text/calendar"))
        if options.output in {"all", "json"}:
            target = ctx.output_path(f"{item.stem}-dates.json")
            target.write_text(json.dumps(events, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            outputs.append(OutputFile(path=target, filename=target.name, mime_type="application/json"))
        if options.output in {"all", "csv"}:
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(["date", "label", "page"])
            for event in events:
                label = event["label"]
                writer.writerow([event["date"], guarded_text(label), event["page"] or ""])
            target = ctx.output_path(f"{item.stem}-dates.csv")
            target.write_text(buffer.getvalue(), encoding="utf-8")
            outputs.append(OutputFile(path=target, filename=target.name, mime_type="text/csv"))
        return outputs
