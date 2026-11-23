import re
import warnings
from datetime import datetime

import pikepdf
from pydantic import Field, field_validator

from app.files.hidden_data import HiddenDataCounts, HiddenKind, scan_hidden_data
from app.files.metadata import RESERVED_INFO_KEYS, STANDARD_INFO_KEYS
from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolOptions,
)
from app.tools.batch import run_each
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

PDF_DATE = re.compile(r"^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}'\d{2}'?)?$")
CUSTOM_KEY = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")
MAX_TEXT = 2000
MAX_CUSTOM = 50


def validate_pdf_date(value: str) -> str:
    match = PDF_DATE.match(value)
    if match is None:
        raise ValueError("Dates must look like D:YYYYMMDDHHmmSS, for example D:20240131093000.")
    year, month, day, hour, minute, second = (int(part) for part in match.groups()[:6])
    try:
        datetime(year, month, day, hour, minute, second)
    except ValueError as exc:
        raise ValueError("That date or time doesn't exist.") from exc
    return value


class MetadataOptions(ToolOptions):
    title: str | None = Field(default=None, max_length=MAX_TEXT)
    author: str | None = Field(default=None, max_length=MAX_TEXT)
    subject: str | None = Field(default=None, max_length=MAX_TEXT)
    keywords: str | None = Field(default=None, max_length=MAX_TEXT)
    creator: str | None = Field(default=None, max_length=MAX_TEXT)
    producer: str | None = Field(default=None, max_length=MAX_TEXT)
    creation_date: str | None = Field(default=None, max_length=32)
    modification_date: str | None = Field(default=None, max_length=32)
    custom: dict[str, str] = Field(default_factory=dict, max_length=MAX_CUSTOM)
    remove_all: bool = False
    remove_attachments: bool = False
    remove_javascript: bool = False
    remove_thumbnails: bool = False

    @field_validator("creation_date", "modification_date")
    @classmethod
    def _date(cls, value: str | None) -> str | None:
        return validate_pdf_date(value) if value else value

    @field_validator("custom")
    @classmethod
    def _custom(cls, value: dict[str, str]) -> dict[str, str]:
        for key, text in value.items():
            if not CUSTOM_KEY.match(key):
                raise ValueError(
                    "Custom property names start with a letter and use only letters, digits, '.', '_' or '-'"
                    " (up to 64 characters)."
                )
            if f"/{key}" in RESERVED_INFO_KEYS:
                raise ValueError(f"'{key}' is a standard property; edit it in its own field.")
            if len(text) > MAX_TEXT:
                raise ValueError(f"Custom property values are limited to {MAX_TEXT} characters.")
        return value

    def hidden_kinds(self) -> frozenset[HiddenKind]:
        kinds: set[HiddenKind] = set()
        if self.remove_attachments:
            kinds.add("attachments")
        if self.remove_javascript:
            kinds.add("javascript")
        if self.remove_thumbnails:
            kinds.add("thumbnails")
        return frozenset(kinds)


def clear_metadata(pdf: pikepdf.Pdf) -> None:
    if "/Info" in pdf.trailer:
        del pdf.trailer["/Info"]
    if "/Metadata" in pdf.Root:
        del pdf.Root["/Metadata"]
    for page in pdf.pages:
        if "/Metadata" in page.obj:
            del page.obj["/Metadata"]


def _sync_xmp(pdf: pikepdf.Pdf) -> None:
    with (
        warnings.catch_warnings(),
        pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as meta,
    ):
        warnings.simplefilter("ignore", UserWarning)
        meta.load_from_docinfo(pdf.docinfo, delete_missing=True, raise_failure=False)


def apply_metadata(pdf: pikepdf.Pdf, options: MetadataOptions) -> None:
    values = {name: getattr(options, name) for name in STANDARD_INFO_KEYS}
    updates: dict[str, str | None] = {
        STANDARD_INFO_KEYS[name]: value for name, value in values.items() if value is not None
    }
    updates.update({f"/{key}": value for key, value in options.custom.items()})
    info = pdf.docinfo
    for key, value in updates.items():
        if value:
            info[key] = pikepdf.String(value)
        elif key in info:
            del info[key]
    try:
        _sync_xmp(pdf)
    except Exception:
        if "/Metadata" in pdf.Root:
            del pdf.Root["/Metadata"]
        _sync_xmp(pdf)


def edit_metadata(pdf: pikepdf.Pdf, options: MetadataOptions) -> HiddenDataCounts:
    if options.remove_all:
        clear_metadata(pdf)
    else:
        apply_metadata(pdf, options)
    return scan_hidden_data(pdf, options.hidden_kinds())


def _describe(counts: HiddenDataCounts) -> str:
    return (
        f"Removed {counts.attachments} attachments, {counts.javascript} scripts, "
        f"{counts.thumbnails} thumbnails"
    )


class EditMetadataTool(Tool[MetadataOptions]):
    slug = "edit-metadata"
    name = "Edit metadata"
    category = ToolCategory.EDIT
    summary = "View and change document properties, or strip metadata and hidden data."
    input_spec = InputSpec(
        min_files=1, max_files=100, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = MetadataOptions
    seconds_per_page = 0.001

    def run(self, ctx: JobContext[MetadataOptions]) -> list[OutputFile]:
        options = ctx.options

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            with open_pdf(item) as pdf:
                counts = edit_metadata(pdf, options)
                target = ctx.output_path(pdf_name(f"{item.stem}-metadata", "metadata"))
                save_pdf(pdf, target)
            ctx.report(0.95, _describe(counts))
            return [output_pdf(target)]

        return run_each(ctx, handle, "Updating file")
