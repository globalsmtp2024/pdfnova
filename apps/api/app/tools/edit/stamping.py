from collections.abc import Callable, Sequence
from typing import Any, Literal

import pikepdf

from app.core.errors import ToolInputError
from app.files.sniff import FileKind
from app.text.overlay import OverlayDocument, parse_hex_color
from app.tools.base import InputFile, InputFileInfo, InputSpec, JobContext, OutputFile
from app.tools.batch import run_each
from app.tools.pages import parse_page_ranges, parse_page_set
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

Parity = Literal["all", "odd", "even"]
POINTS_PER_MM = 72 / 25.4
STAMP_SPEC = InputSpec(
    min_files=1, max_files=100, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
)
NOTHING_SELECTED = "Those settings leave no pages to change."
NOTHING_HINT = "Check the page range, odd/even choice and skip settings."


def checked_color(value: str) -> str:
    parse_hex_color(value)
    return value


def select_pages(
    count: int,
    expression: str | None,
    parity: Parity,
    first_page: int = 1,
    skip_first: int = 0,
    skip_last: int = 0,
) -> list[int]:
    chosen = parse_page_set(expression, count)
    return [
        index
        for index in chosen
        if (parity == "all" or (parity == "odd") == (index % 2 == 0))
        and index >= first_page - 1
        and index >= skip_first
        and index < count - skip_last
    ]


def check_expression(files: Sequence[InputFileInfo], expression: str | None) -> None:
    for info in files:
        if info.page_count is not None:
            parse_page_ranges(expression, info.page_count)


PageStamper = Callable[[pikepdf.Pdf, OverlayDocument, InputFile], int]


def stamp_each(ctx: JobContext[Any], stamper: PageStamper, suffix: str, label: str) -> list[OutputFile]:
    def handle(item: InputFile, _: int) -> list[OutputFile]:
        with open_pdf(item) as pdf:
            overlay = OverlayDocument(pdf, prefix="Pdfn")
            changed = stamper(pdf, overlay, item)
            if changed == 0:
                raise ToolInputError(NOTHING_SELECTED, hint=NOTHING_HINT)
            overlay.finalize()
            target = ctx.output_path(pdf_name(f"{item.stem}-{suffix}", suffix))
            save_pdf(pdf, target)
        return [output_pdf(target)]

    return run_each(ctx, handle, label)
