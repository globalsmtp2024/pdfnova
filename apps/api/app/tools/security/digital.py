import base64
import binascii
import json
from collections.abc import Sequence
from typing import Any, Literal

from pydantic import Field
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import fields, signers
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.stamp import TextStampStyle
from pyhanko_certvalidator import ValidationContext

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
from app.tools.batch import run_each
from app.tools.convert.text import validate_pages
from app.tools.pages import parse_page_ranges
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name

P12_SECRET = "pkcs12"
P12_PASSWORD_SECRET = "pkcs12_password"
MAX_P12_BYTES = 64 * 1024
SIGNING_SPEC = InputSpec(
    min_files=1, max_files=20, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)
SINGLE_SPEC = InputSpec(
    min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)


class DigitalSignOptions(ToolOptions):
    visible: bool = False
    page: str = Field(default="last", max_length=40)
    x_percent: float = Field(default=60.0, ge=0, le=100)
    y_percent: float = Field(default=85.0, ge=0, le=100)
    width_percent: float = Field(default=35.0, ge=5, le=100)
    height_percent: float = Field(default=8.0, ge=3, le=50)
    reason: str = Field(default="", max_length=200)
    location: str = Field(default="", max_length=200)
    contact: str = Field(default="", max_length=200)
    field_name: str = Field(default="Signature1", pattern=r"^[A-Za-z][A-Za-z0-9_]{0,40}$")


def load_signer(ctx: JobContext[Any]) -> signers.SimpleSigner:
    encoded = ctx.secret(P12_SECRET)
    password = ctx.optional_secret(P12_PASSWORD_SECRET)
    ctx.forget_secrets()
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ToolInputError("The certificate file could not be read.") from exc
    if len(data) > MAX_P12_BYTES:
        raise ToolInputError("The certificate file is too large.")
    loaded: signers.SimpleSigner | None
    try:
        loaded = signers.SimpleSigner.load_pkcs12_data(
            data, other_certs=[], passphrase=password.encode("utf-8") if password else None
        )
    except Exception as exc:
        raise ToolFailedError(
            "The certificate could not be opened. Check the file and its password.",
            code="certificate_invalid",
        ) from exc
    if loaded is None:
        raise ToolFailedError("The certificate file has no signing key.", code="certificate_invalid")
    return loaded


class DigitalSignTool(Tool[DigitalSignOptions]):
    slug = "digital-sign"
    name = "Digital signature"
    category = ToolCategory.SECURITY
    summary = "Sign a PDF with your own .p12 or .pfx certificate, used in memory and never stored."
    input_spec = SIGNING_SPEC
    options_schema = DigitalSignOptions
    accepted_secrets = frozenset({P12_SECRET, P12_PASSWORD_SECRET})
    required_secrets = frozenset({P12_SECRET})
    seconds_per_page = 0.01

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: DigitalSignOptions
    ) -> None:
        if options.visible:
            validate_pages(files, options.page)

    def run(self, ctx: JobContext[DigitalSignOptions]) -> list[OutputFile]:
        options = ctx.options
        signer = load_signer(ctx)

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            target = ctx.output_path(pdf_name(f"{item.stem}-signed", "signed"))
            with open_pdf(item) as probe:
                page_count = len(probe.pages)
            stamp_style = None
            with item.path.open("rb") as source:
                writer = IncrementalPdfFileWriter(source, strict=False)
                if options.visible:
                    index = parse_page_ranges(options.page, page_count)[0]
                    width, height = page_size(item, index)
                    left = width * options.x_percent / 100
                    top = height * options.y_percent / 100
                    box_width = min(width * options.width_percent / 100, width - left)
                    box_height = min(height * options.height_percent / 100, top)
                    fields.append_signature_field(
                        writer,
                        fields.SigFieldSpec(
                            options.field_name,
                            on_page=index,
                            box=(round(left), round(top - box_height), round(left + box_width), round(top)),
                        ),
                    )
                    stamp_style = TextStampStyle(
                        stamp_text="Digitally signed by %(signer)s\nDate: %(ts)s", border_width=1
                    )
                metadata = signers.PdfSignatureMetadata(
                    field_name=options.field_name,
                    reason=options.reason or None,
                    location=options.location or None,
                    contact_info=options.contact or None,
                )
                pdf_signer = signers.PdfSigner(metadata, signer=signer, stamp_style=stamp_style)
                with target.open("wb") as output:
                    pdf_signer.sign_pdf(writer, output=output)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Signing file")


def page_size(item: InputFile, index: int) -> tuple[float, float]:
    with open_pdf(item) as pdf:
        box = [float(value) for value in pdf.pages[index].mediabox]
    return abs(box[2] - box[0]), abs(box[3] - box[1])


class VerifyOptions(ToolOptions):
    format: Literal["json", "text", "both"] = "both"


def describe(signature: Any, context: ValidationContext) -> dict[str, Any]:
    try:
        status = validate_pdf_signature(signature, context)
    except Exception as exc:
        return {"field": signature.field_name, "readable": False, "problem": type(exc).__name__}
    subject = status.signing_cert.subject.human_friendly if status.signing_cert is not None else None
    timestamp = signature.self_reported_timestamp
    return {
        "field": signature.field_name,
        "readable": True,
        "signer": subject,
        "signing_time": timestamp.isoformat() if timestamp else None,
        "integrity_intact": bool(status.intact),
        "signature_valid": bool(status.valid),
        "signer_trusted": bool(status.trusted),
        "covers_whole_document": str(status.coverage).endswith("ENTIRE_FILE"),
        "changes_after_signing": str(status.modification_level).split(".")[-1],
        "summary": status.summary(),
    }


class VerifySignaturesTool(Tool[VerifyOptions]):
    slug = "verify-signatures"
    name = "Verify signatures"
    category = ToolCategory.SECURITY
    summary = (
        "Check every digital signature in a PDF for integrity and later changes. Signer trust is not assumed."
    )
    input_spec = SINGLE_SPEC
    options_schema = VerifyOptions
    seconds_per_page = 0.01

    def run(self, ctx: JobContext[VerifyOptions]) -> list[OutputFile]:
        item = ctx.inputs[0]
        try:
            handle = item.path.open("rb")
        except OSError as exc:
            raise ToolFailedError("This PDF could not be read.", code="pdf_unreadable") from exc
        with handle:
            try:
                reader = PdfFileReader(handle, strict=False)
                signatures = list(reader.embedded_signatures)
            except Exception as exc:
                raise ToolFailedError("This PDF could not be read.", code="pdf_unreadable") from exc
            context = ValidationContext(allow_fetching=False)
            results = [describe(signature, context) for signature in signatures]
        report = {"signature_count": len(results), "signatures": results}
        outputs: list[OutputFile] = []
        if ctx.options.format in {"json", "both"}:
            target = ctx.output_path(f"{item.stem}-signatures.json")
            target.write_text(json.dumps(report, indent=2), encoding="utf-8")
            outputs.append(OutputFile(path=target, filename=target.name, mime_type="application/json"))
        if ctx.options.format in {"text", "both"}:
            lines = [f"Signatures found: {len(results)}", ""]
            for entry in results:
                lines.append(f"Field: {entry['field']}")
                if not entry.get("readable"):
                    lines.append("  This signature could not be read.")
                    lines.append("")
                    continue
                lines.append(f"  Signer: {entry['signer']}")
                lines.append(f"  Signed at: {entry['signing_time'] or 'not recorded'}")
                lines.append(
                    f"  Document unchanged since signing: {'yes' if entry['integrity_intact'] else 'NO'}"
                )
                lines.append(
                    f"  Signature mathematically valid: {'yes' if entry['signature_valid'] else 'NO'}"
                )
                lines.append(f"  Signer trusted: {'yes' if entry['signer_trusted'] else 'not established'}")
                lines.append(f"  Covers the whole file: {'yes' if entry['covers_whole_document'] else 'no'}")
                lines.append(f"  Changes after signing: {entry['changes_after_signing']}")
                lines.append("")
            target = ctx.output_path(f"{item.stem}-signatures.txt")
            target.write_text("\n".join(lines), encoding="utf-8")
            outputs.append(OutputFile(path=target, filename=target.name, mime_type="text/plain"))
        return outputs
