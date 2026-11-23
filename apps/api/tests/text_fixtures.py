from pathlib import Path
from typing import Any

import pikepdf

from app.files.sniff import FileKind
from app.tools.base import InputFile, InputFileInfo, JobContext, Tool
from tests.qpdf_check import assert_qpdf_ok


def make_geometry_pdf(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with pikepdf.new() as pdf:
        for rotation in (0, 90, 180, 270):
            pdf.add_blank_page(page_size=(400, 600))
            if rotation:
                pdf.pages[-1].obj.Rotate = rotation
        pdf.add_blank_page(page_size=(600, 800))
        offset = pdf.pages[-1].obj
        offset.MediaBox = pikepdf.Array([-300, -200, 300, 600])
        offset.CropBox = pikepdf.Array([-100, -100, 200, 500])
        pdf.add_blank_page(page_size=(500, 700))
        both = pdf.pages[-1].obj
        both.MediaBox = pikepdf.Array([1000, 2000, 1500, 2700])
        both.Rotate = 90
        pdf.save(path)
    return path


def make_inherited_pdf(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with pikepdf.new() as pdf:
        pdf.add_blank_page(page_size=(300, 400))
        pdf.add_blank_page(page_size=(300, 400))
        for page in pdf.pages:
            del page.obj["/MediaBox"]
            if "/Resources" in page.obj:
                del page.obj["/Resources"]
        pdf.Root.Pages.MediaBox = pikepdf.Array([0, 0, 300, 400])
        pdf.Root.Pages.Rotate = 180
        pdf.Root.Pages.Resources = pikepdf.Dictionary()
        pdf.save(path)
    return path


def ink_box(path: Path, index: int, threshold: int = 200) -> tuple[float, float, float, float] | None:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(path))
    try:
        image = document[index].render(scale=1).to_pil().convert("L")
    finally:
        document.close()
    mask = image.point(lambda value: 255 if value < threshold else 0)
    box = mask.getbbox()
    if box is None:
        return None
    width, height = image.size
    return (box[0] / width, box[1] / height, box[2] / width, box[3] / height)


def pdfium_texts(path: Path) -> list[str]:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(path))
    try:
        texts: list[str] = []
        for index in range(len(document)):
            textpage = document[index].get_textpage()
            texts.append(textpage.get_text_range())
            textpage.close()
        return texts
    finally:
        document.close()


def as_input(path: Path, name: str | None = None) -> InputFile:
    with pikepdf.open(path) as pdf:
        count = len(pdf.pages)
    return InputFile(
        path=path,
        original_name=name or path.name,
        kind=FileKind.PDF,
        mime_type="application/pdf",
        size_bytes=path.stat().st_size,
        page_count=count,
    )


def run_tool(tool: Tool[Any], tmp_path: Path, inputs: list[InputFile], **options: object) -> list[Any]:
    parsed = tool.parse_options(dict(options))
    tool.validate_inputs(
        [InputFileInfo(item.original_name, item.size_bytes, item.kind, item.page_count) for item in inputs],
        parsed,
    )
    ctx = JobContext(workdir=tmp_path / "work", inputs=inputs, options=parsed)
    outputs = tool.run(ctx)
    for output in outputs:
        if output.mime_type == "application/pdf":
            assert_qpdf_ok(output.path)
    return outputs


def embedded_fonts(path: Path) -> dict[str, int]:
    found: dict[str, int] = {}
    with pikepdf.open(path) as pdf:
        for obj in pdf.objects:
            if isinstance(obj, pikepdf.Dictionary) and obj.get("/Type") == pikepdf.Name.FontDescriptor:
                file_stream = obj.get("/FontFile2")
                if file_stream is not None:
                    found[str(obj.FontName)] = len(file_stream.read_bytes())
    return found
