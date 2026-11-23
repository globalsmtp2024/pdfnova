from typing import Literal

import pikepdf
from PIL import ImageCms
from pydantic import Field

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
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

EMBEDDED_FONT_KEYS = ("/FontFile", "/FontFile2", "/FontFile3")
CHECKED_FONT_SUBTYPES = {"/Type1", "/MMType1", "/TrueType", "/CIDFontType0", "/CIDFontType2"}
FORBIDDEN_ACTION_NAMES = {"/JavaScript", "/Launch", "/Sound", "/Movie", "/ResetForm", "/ImportData"}
PRINT_FLAG = 4
HIDDEN_FLAGS = 2 | 32 | 256
PART_VERSION = {"1": "1.4", "2": "1.7", "3": "1.7"}


class PdfToPdfaOptions(ToolOptions):
    level: Literal["1b", "2b", "3b"] = "2b"
    allow_unembedded_fonts: bool = Field(default=False)


def srgb_profile_bytes() -> bytes:
    return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def unembedded_fonts(pdf: pikepdf.Pdf) -> list[str]:
    missing: list[str] = []
    for obj in pdf.objects:
        if not isinstance(obj, pikepdf.Dictionary) or obj.get("/Type") != "/Font":
            continue
        if str(obj.get("/Subtype")) not in CHECKED_FONT_SUBTYPES:
            continue
        descriptor = obj.get("/FontDescriptor")
        embedded = isinstance(descriptor, pikepdf.Dictionary) and any(
            key in descriptor for key in EMBEDDED_FONT_KEYS
        )
        if not embedded:
            missing.append(str(obj.get("/BaseFont", "unnamed")).lstrip("/"))
    return sorted(set(missing))


def uses_transparency(pdf: pikepdf.Pdf) -> bool:
    for obj in pdf.objects:
        if not isinstance(obj, (pikepdf.Dictionary, pikepdf.Stream)):
            continue
        if "/SMask" in obj and obj.get("/SMask") != pikepdf.Name("/None"):
            return True
        if obj.get("/Type") == "/ExtGState":
            if float(obj.get("/CA", 1)) < 1 or float(obj.get("/ca", 1)) < 1:
                return True
            if str(obj.get("/BM", "/Normal")) not in {"/Normal", "/Compatible"}:
                return True
    return False


def strip_active_content(pdf: pikepdf.Pdf, drop_attachments: bool) -> None:
    root = pdf.Root
    for key in ("/OpenAction", "/AA", "/Perms", "/Requirements"):
        if key in root:
            del root[key]
    names = root.get("/Names")
    if isinstance(names, pikepdf.Dictionary):
        for key in ("/JavaScript", "/AlternatePresentations", "/Renditions"):
            if key in names:
                del names[key]
        if drop_attachments and "/EmbeddedFiles" in names:
            del names["/EmbeddedFiles"]
    if drop_attachments and "/AF" in root:
        del root["/AF"]
    for page in pdf.pages:
        if "/AA" in page.obj:
            del page.obj["/AA"]
        annotations = page.obj.get("/Annots")
        if annotations is None:
            continue
        for annotation in annotations:
            if "/AA" in annotation:
                del annotation["/AA"]
            action = annotation.get("/A")
            if isinstance(action, pikepdf.Dictionary) and str(action.get("/S")) in FORBIDDEN_ACTION_NAMES:
                del annotation["/A"]
            flags = int(annotation.get("/F", 0))
            annotation["/F"] = (flags | PRINT_FLAG) & ~HIDDEN_FLAGS


def attach_output_intent(pdf: pikepdf.Pdf) -> None:
    profile = pdf.make_stream(srgb_profile_bytes())
    profile["/N"] = 3
    intent = pikepdf.Dictionary(
        Type=pikepdf.Name.OutputIntent,
        S=pikepdf.Name.GTS_PDFA1,
        OutputConditionIdentifier=pikepdf.String("sRGB IEC61966-2.1"),
        RegistryName=pikepdf.String("http://www.color.org"),
        Info=pikepdf.String("sRGB IEC61966-2.1"),
        DestOutputProfile=profile,
    )
    pdf.Root["/OutputIntents"] = pikepdf.Array([pdf.make_indirect(intent)])


def stamp_conformance(pdf: pikepdf.Pdf, level: str) -> None:
    with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=True) as metadata:
        metadata["pdfaid:part"] = level[0]
        metadata["pdfaid:conformance"] = level[1].upper()


class PdfToPdfaTool(Tool[PdfToPdfaOptions]):
    slug = "pdf-to-pdfa"
    name = "PDF to PDF/A"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Convert a PDF to PDF/A-1b, 2b or 3b with an embedded sRGB colour profile and XMP metadata."
    input_spec = InputSpec(
        min_files=1, max_files=1, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = PdfToPdfaOptions
    seconds_per_mb = 0.6

    def run(self, ctx: JobContext[PdfToPdfaOptions]) -> list[OutputFile]:
        level = ctx.options.level
        item = ctx.inputs[0]
        ctx.report(0.1, "Checking the document")
        with open_pdf(item) as pdf:
            missing = unembedded_fonts(pdf)
            if missing and not ctx.options.allow_unembedded_fonts:
                raise ToolFailedError(
                    "PDF/A requires every font to be embedded. Not embedded: "
                    + ", ".join(missing[:5])
                    + ". Re-export the document with fonts embedded, or allow conversion anyway.",
                    code="fonts_not_embedded",
                )
            if level == "1b" and uses_transparency(pdf):
                raise ToolFailedError(
                    "PDF/A-1b does not allow transparency, and this document uses it. Choose PDF/A-2b.",
                    code="transparency_not_allowed",
                )
            ctx.report(0.4, "Preparing archive structure")
            strip_active_content(pdf, drop_attachments=level != "3b")
            attach_output_intent(pdf)
            stamp_conformance(pdf, level)
            target = ctx.output_path(pdf_name(item.stem, f"pdfa-{level}"))
            ctx.report(0.8, "Saving")
            options: dict[str, object] = {"force_version": PART_VERSION[level[0]], "encryption": False}
            if level == "1b":
                options["object_stream_mode"] = pikepdf.ObjectStreamMode.disable
            save_pdf(pdf, target, **options)
        ctx.report(1.0, "Packaging")
        return [output_pdf(target)]
