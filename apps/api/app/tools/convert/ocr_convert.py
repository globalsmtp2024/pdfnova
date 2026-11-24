from collections.abc import Sequence
from typing import Any

from pydantic import Field

from app.tools.base import (
    InputFile,
    InputFileInfo,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolOptions,
)
from app.files.sniff import FileKind
from app.tools.convert.ocr import LANGUAGE_PATTERN, OcrOptions, OcrPdfTool
from app.tools.convert.office_more import PdfToPowerPointOptions, PdfToPowerPointTool
from app.tools.convert.office_out import (
    OFFICE_SPEC,
    PdfToExcelOptions,
    PdfToExcelTool,
    PdfToWordOptions,
    PdfToWordTool,
)
from app.tools.convert.text import validate_pages


class OcrConvertOptions(ToolOptions):
    language: str = Field(default="eng+urd", pattern=LANGUAGE_PATTERN, max_length=60)
    dpi: int = Field(default=300, ge=150, le=400)
    pages: str | None = Field(default=None, max_length=2000)


class OcrConvertTool(Tool[OcrConvertOptions]):
    input_spec = OFFICE_SPEC.model_copy(update={"accepted_kinds": frozenset({FileKind.PDF, FileKind.IMAGE})})
    options_schema = OcrConvertOptions
    seconds_per_page = 3.5
    converter: Tool[Any]
    converter_options: Any

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: OcrConvertOptions
    ) -> None:
        validate_pages([info for info in files if info.kind is FileKind.PDF], options.pages)

    def run(self, ctx: JobContext[OcrConvertOptions]) -> list[OutputFile]:
        options = ctx.options
        outputs: list[OutputFile] = []
        total = len(ctx.inputs)
        for number, item in enumerate(ctx.inputs):
            ctx.ensure_not_cancelled()
            recognise_dir = ctx.workdir / f"ocr-{number + 1}"
            recognise_dir.mkdir(parents=True, exist_ok=True)

            def report_ocr(fraction: float, label: str, base: int = number) -> None:
                ctx.report((base + fraction * 0.7) / total, label)

            searchable = OcrPdfTool().run(
                JobContext(
                    workdir=recognise_dir,
                    inputs=[item],
                    options=OcrOptions(language=options.language, dpi=options.dpi, pages=options.pages),
                    reporter=report_ocr,
                    is_cancelled=ctx.is_cancelled,
                )
            )[0]
            recognised = InputFile(
                path=searchable.path,
                original_name=f"{item.stem}.pdf",
                kind=FileKind.PDF,
                mime_type="application/pdf",
                size_bytes=searchable.path.stat().st_size,
                page_count=None,
            )
            convert_dir = ctx.workdir / f"convert-{number + 1}"
            convert_dir.mkdir(parents=True, exist_ok=True)

            def report_convert(fraction: float, label: str, base: int = number) -> None:
                ctx.report((base + 0.7 + fraction * 0.3) / total, label)

            outputs.extend(
                self.converter.run(
                    JobContext(
                        workdir=convert_dir,
                        inputs=[recognised],
                        options=self.converter_options(),
                        reporter=report_convert,
                        is_cancelled=ctx.is_cancelled,
                    )
                )
            )
        return outputs


class PdfToWordOcrTool(OcrConvertTool):
    slug = "pdf-to-word-ocr"
    name = "PDF to Word (OCR)"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Recognise the text of a scanned PDF first, then convert it to an editable Word document."
    converter = PdfToWordTool()
    converter_options = PdfToWordOptions


class PdfToPowerPointOcrTool(OcrConvertTool):
    slug = "pdf-to-powerpoint-ocr"
    name = "PDF to PowerPoint (OCR)"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Recognise the text of a scanned PDF first, then convert it to a PowerPoint presentation."
    converter = PdfToPowerPointTool()
    converter_options = PdfToPowerPointOptions


class PdfToExcelOcrTool(OcrConvertTool):
    slug = "pdf-to-excel-ocr"
    name = "PDF to Excel (OCR)"
    category = ToolCategory.CONVERT_FROM_PDF
    summary = "Recognise the text of a scanned PDF first, then pull its tables into an Excel workbook."
    converter = PdfToExcelTool()
    converter_options = PdfToExcelOptions

