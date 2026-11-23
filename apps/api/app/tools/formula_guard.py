from typing import Any

FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def guarded_text(value: str) -> str:
    return "'" + value if value.startswith(FORMULA_STARTS) else value


def append_text_row(sheet: Any, row: list[str]) -> None:
    sheet.append(row)
    for cell in sheet[sheet.max_row]:
        if isinstance(cell.value, str) and cell.value.startswith(FORMULA_STARTS):
            cell.data_type = "s"
