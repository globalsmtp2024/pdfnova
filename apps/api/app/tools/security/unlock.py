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


class UnlockOptions(ToolOptions):
    pass


class UnlockTool(Tool[UnlockOptions]):
    slug = "unlock"
    name = "Unlock PDF"
    category = ToolCategory.SECURITY
    summary = "Remove the open password and editing restrictions from PDFs you are allowed to change."
    input_spec = InputSpec(
        min_files=1, max_files=50, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = UnlockOptions
    decrypt_inputs = False
    seconds_per_page = 0.002

    def run(self, ctx: JobContext[UnlockOptions]) -> list[OutputFile]:
        def handle(item: InputFile, _: int) -> list[OutputFile]:
            target = ctx.output_path(pdf_name(f"{item.stem}-unlocked", "unlocked"))
            with open_pdf(item) as pdf:
                save_pdf(pdf, target, encryption=False)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Unlocking")
