import importlib
import inspect
import pkgutil
from functools import lru_cache
from typing import Any

import structlog

from app.core.errors import NotFoundError
from app.tools.base import Tool

logger = structlog.get_logger()


def _all_tool_classes() -> list[type[Tool[Any]]]:
    import app.tools as tools_package

    for module_info in pkgutil.walk_packages(tools_package.__path__, prefix="app.tools."):
        try:
            importlib.import_module(module_info.name)
        except ModuleNotFoundError as error:
            logger.error("tool_module_skipped", module=module_info.name, missing=error.name)
    found: list[type[Tool[Any]]] = []
    pending: list[type[Tool[Any]]] = list(Tool.__subclasses__())
    while pending:
        candidate = pending.pop()
        pending.extend(candidate.__subclasses__())
        if not inspect.isabstract(candidate) and getattr(candidate, "slug", None):
            found.append(candidate)
    return found


class ToolRegistry:
    def __init__(self, tools: list[type[Tool[Any]]]):
        self._tools: dict[str, Tool[Any]] = {}
        for tool_class in tools:
            if tool_class.slug in self._tools:
                raise RuntimeError(f"Duplicate tool slug: {tool_class.slug}")
            self._tools[tool_class.slug] = tool_class()

    def get(self, slug: str) -> Tool[Any]:
        tool = self._tools.get(slug)
        if tool is None:
            raise NotFoundError(f"Unknown tool '{slug}'.")
        return tool

    def __contains__(self, slug: object) -> bool:
        return slug in self._tools

    def all(self) -> list[Tool[Any]]:
        return sorted(self._tools.values(), key=lambda t: (t.category.value, t.name))


@lru_cache
def get_registry() -> ToolRegistry:
    return ToolRegistry(_all_tool_classes())
