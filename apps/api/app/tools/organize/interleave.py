from collections.abc import Sequence

import pikepdf

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.tools.base import (
    InputFileInfo,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolOptions,
)
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf


class InterleaveOptions(ToolOptions):
    reverse_second: bool = True
    allow_unequal: bool = False


class InterleavePagesTool(Tool[InterleaveOptions]):
    slug = "interleave-pages"
    name = "Interleave odd and even scans"
    category = ToolCategory.ORGANIZE
    summary = "Combine a scan of the front sides with a scan of the back sides into one document."
    input_spec = InputSpec(
        min_files=2, max_files=2, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = InterleaveOptions
    seconds_per_page = 0.004

    def validate_options_against_inputs(
        self, files: Sequence[InputFileInfo], options: InterleaveOptions
    ) -> None:
        first, second = files
        if first.page_count is None or second.page_count is None or options.allow_unequal:
            return
        if abs(first.page_count - second.page_count) > 1:
            raise ToolInputError(
                "The two scans have a different number of pages.",
                hint="Check that you uploaded the front sides first and the back sides second.",
            )

    def run(self, ctx: JobContext[InterleaveOptions]) -> list[OutputFile]:
        options = ctx.options
        with open_pdf(ctx.inputs[0]) as odd, open_pdf(ctx.inputs[1]) as even:
            odd_pages = list(range(len(odd.pages)))
            even_pages = list(range(len(even.pages)))
            if options.reverse_second:
                even_pages.reverse()
            if not options.allow_unequal and abs(len(odd_pages) - len(even_pages)) > 1:
                raise ToolInputError("The two scans have a different number of pages.")

            result = pikepdf.new()
            with result:
                for position in range(max(len(odd_pages), len(even_pages))):
                    ctx.ensure_not_cancelled()
                    ctx.report(position / max(len(odd_pages), len(even_pages)), "Interleaving pages")
                    if position < len(odd_pages):
                        result.pages.append(odd.pages[odd_pages[position]])
                    if position < len(even_pages):
                        result.pages.append(even.pages[even_pages[position]])
                target = ctx.output_path(pdf_name(f"{ctx.inputs[0].stem}-interleaved", "interleaved"))
                save_pdf(result, target)
        return [output_pdf(target)]
