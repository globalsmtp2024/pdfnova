import re

from app.core.errors import ToolInputError

_NUMBER = r"(?:\d+|last|end)"
_RANGE = re.compile(rf"^(?P<start>{_NUMBER})?\s*(?P<dash>-)?\s*(?P<end>{_NUMBER})?$", re.IGNORECASE)
KEYWORDS = {"odd", "even", "all"}


class PageExpressionError(ToolInputError):
    def __init__(self, token: str, page_count: int, reason: str):
        super().__init__(
            f"'{token}' {reason}",
            hint=(
                f"Use page numbers from 1 to {page_count}, ranges like 2-5 or 8-end, "
                "odd, even, or !3 to exclude."
            ),
            details={"token": token, "page_count": page_count},
        )
        self.token = token
        self.page_count = page_count


def _resolve(token: str, page_count: int) -> int:
    lowered = token.lower()
    return page_count if lowered in {"last", "end"} else int(token)


def _expand(token: str, page_count: int) -> list[int]:
    lowered = token.lower()
    if lowered == "all":
        return list(range(page_count))
    if lowered == "odd":
        return list(range(0, page_count, 2))
    if lowered == "even":
        return list(range(1, page_count, 2))
    match = _RANGE.match(token)
    if not match or not (match["start"] or match["end"]):
        raise PageExpressionError(token, page_count, "is not a valid page or range.")
    start = _resolve(match["start"], page_count) if match["start"] else 1
    open_end = _resolve(match["end"], page_count) if match["end"] else page_count
    end = open_end if match["dash"] else start
    for value in (start, end):
        if value < 1 or value > page_count:
            raise PageExpressionError(
                token, page_count, f"is outside this document, which has {page_count} pages."
            )
    step = 1 if end >= start else -1
    return [index - 1 for index in range(start, end + step, step)]


def parse_page_ranges(expression: str | None, page_count: int) -> list[int]:
    if page_count < 1:
        raise ToolInputError("This document has no pages.")
    if expression is None or not expression.strip():
        return list(range(page_count))
    included: list[int] = []
    excluded: set[int] = set()
    has_inclusion = False
    for raw in expression.split(","):
        token = raw.strip()
        if not token:
            continue
        if token.startswith("!"):
            target = token[1:].strip()
            if not target:
                raise PageExpressionError(token, page_count, "needs a page or range after '!'.")
            excluded.update(_expand(target, page_count))
            continue
        has_inclusion = True
        included.extend(_expand(token, page_count))
    if not has_inclusion:
        if not excluded:
            raise ToolInputError("The page range selects no pages.", hint="Enter at least one page number.")
        included = list(range(page_count))
    pages = [page for page in included if page not in excluded]
    if not pages:
        raise ToolInputError("The page range selects no pages.", hint="Enter at least one page number.")
    return pages


def parse_page_set(expression: str | None, page_count: int) -> list[int]:
    return sorted(set(parse_page_ranges(expression, page_count)))


def format_page_set(pages: list[int]) -> str:
    ordered = sorted(set(pages))
    if not ordered:
        return ""
    parts: list[str] = []
    start = previous = ordered[0]
    for page in ordered[1:]:
        if page == previous + 1:
            previous = page
            continue
        parts.append(f"{start + 1}" if start == previous else f"{start + 1}-{previous + 1}")
        start = previous = page
    parts.append(f"{start + 1}" if start == previous else f"{start + 1}-{previous + 1}")
    return ", ".join(parts)
