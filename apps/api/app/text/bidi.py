import unicodedata
from dataclasses import dataclass
from typing import Literal

Direction = Literal["auto", "ltr", "rtl"]
_RTL_CLASSES = frozenset({"R", "AL"})
_NUMBER_CLASSES = frozenset({"EN", "AN"})
_SEPARATOR_CLASSES = frozenset({"CS", "ES", "ET"})
_MARK_CLASSES = frozenset({"NSM", "BN"})


@dataclass(frozen=True)
class Run:
    text: str
    rtl: bool


def _kind(char: str) -> str:
    category = unicodedata.bidirectional(char)
    if category in _RTL_CLASSES:
        return "R"
    if category == "L":
        return "L"
    if category in _NUMBER_CLASSES:
        return "N"
    if category in _SEPARATOR_CLASSES:
        return "S"
    if category in _MARK_CLASSES:
        return "M"
    return "W"


def paragraph_is_rtl(text: str, direction: Direction = "auto") -> bool:
    if direction != "auto":
        return direction == "rtl"
    for char in text:
        kind = _kind(char)
        if kind == "R":
            return True
        if kind == "L":
            return False
    return False


def _resolve(text: str, rtl_paragraph: bool) -> list[str]:
    kinds = [_kind(char) for char in text]
    for index, kind in enumerate(kinds):
        if kind == "M":
            kinds[index] = kinds[index - 1] if index > 0 else "W"
    for index, kind in enumerate(kinds):
        if kind == "S" and 0 < index < len(kinds) - 1 and kinds[index - 1] == "N" and kinds[index + 1] == "N":
            kinds[index] = "N"
    resolved = ["R" if kind == "R" else "L" if kind in {"L", "N"} else "" for kind in kinds]
    number = [kind == "N" for kind in kinds]
    for index, value in enumerate(resolved):
        if value:
            continue
        end = index
        while end < len(resolved) and not resolved[end]:
            end += 1
        before = _strength(resolved, number, index - 1, rtl_paragraph)
        after = _strength(resolved, number, end, rtl_paragraph)
        fill = before if before is not None and before == after else ("R" if rtl_paragraph else "L")
        for position in range(index, end):
            resolved[position] = fill
    return resolved


def _strength(resolved: list[str], number: list[bool], index: int, rtl_paragraph: bool) -> str | None:
    if index < 0 or index >= len(resolved):
        return "R" if rtl_paragraph else "L"
    if number[index]:
        return "R" if rtl_paragraph else "L"
    return resolved[index] or None


def logical_runs(text: str, direction: Direction = "auto") -> tuple[bool, list[Run]]:
    rtl_paragraph = paragraph_is_rtl(text, direction)
    if not text:
        return rtl_paragraph, []
    resolved = _resolve(text, rtl_paragraph)
    runs: list[Run] = []
    start = 0
    for index in range(1, len(text) + 1):
        if index == len(text) or resolved[index] != resolved[start]:
            runs.append(Run(text[start:index], resolved[start] == "R"))
            start = index
    return rtl_paragraph, runs


def visual_runs(text: str, direction: Direction = "auto") -> list[Run]:
    rtl_paragraph, runs = logical_runs(text, direction)
    if not rtl_paragraph:
        ordered: list[Run] = []
        index = 0
        while index < len(runs):
            if runs[index].rtl:
                end = index
                while end < len(runs) and (runs[end].rtl or _number_between(runs, end)):
                    end += 1
                ordered.extend(reversed(runs[index:end]))
                index = end
            else:
                ordered.append(runs[index])
                index += 1
        return ordered
    return list(reversed(runs))


def _number_between(runs: list[Run], index: int) -> bool:
    return (
        0 < index < len(runs) - 1
        and runs[index - 1].rtl
        and runs[index + 1].rtl
        and all(_kind(char) in {"N", "S"} for char in runs[index].text)
    )
