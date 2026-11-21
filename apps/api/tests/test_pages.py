import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.core.errors import ToolInputError
from app.tools.pages import PageExpressionError, format_page_set, parse_page_ranges, parse_page_set


@pytest.mark.parametrize(
    ("expression", "count", "expected"),
    [
        ("1-5, 8, 11-end", 12, [0, 1, 2, 3, 4, 7, 10, 11]),
        ("odd", 5, [0, 2, 4]),
        ("even", 5, [1, 3]),
        ("last", 7, [6]),
        ("!3", 4, [0, 1, 3]),
        ("1-6, !2-3", 6, [0, 3, 4, 5]),
        ("odd, !1", 6, [2, 4]),
        ("  5 -  3 ", 6, [4, 3, 2]),
        ("end-1", 3, [2, 1, 0]),
        ("ALL", 2, [0, 1]),
        ("1", 1, [0]),
        ("4999-end", 5000, [4998, 4999]),
    ],
)
def test_expressions(expression: str, count: int, expected: list[int]) -> None:
    assert parse_page_ranges(expression, count) == expected


@pytest.mark.parametrize(
    ("expression", "token"), [("1, x", "x"), ("2-99", "2-99"), ("0", "0"), ("!", "!"), ("3--4", "3--4")]
)
def test_errors_name_the_token(expression: str, token: str) -> None:
    with pytest.raises(PageExpressionError) as caught:
        parse_page_ranges(expression, 10)
    assert caught.value.token == token
    assert caught.value.details["page_count"] == 10


def test_selecting_nothing_is_an_error() -> None:
    with pytest.raises(ToolInputError):
        parse_page_ranges("!1-3", 3)
    with pytest.raises(ToolInputError):
        parse_page_ranges(",", 3)
    with pytest.raises(ToolInputError):
        parse_page_ranges(None, 0)


@given(
    st.lists(st.integers(min_value=0, max_value=499), min_size=1, max_size=60),
    st.integers(min_value=500, max_value=600),
)
def test_format_round_trips(pages: list[int], count: int) -> None:
    assert parse_page_set(format_page_set(pages), count) == sorted(set(pages))


@given(st.integers(min_value=1, max_value=5000), st.data())
def test_ranges_stay_inside_document(count: int, data: st.DataObject) -> None:
    start = data.draw(st.integers(min_value=1, max_value=count))
    end = data.draw(st.integers(min_value=1, max_value=count))
    pages = parse_page_ranges(f"{start}-{end}", count)
    assert len(pages) == abs(end - start) + 1
    assert all(0 <= page < count for page in pages)
