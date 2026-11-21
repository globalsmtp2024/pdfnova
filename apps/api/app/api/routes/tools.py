from typing import Any

from fastapi import APIRouter

from app.api.deps import ContainerDep

router = APIRouter(prefix="/api/v1/tools", tags=["tools"])


@router.get("")
async def list_tools(container: ContainerDep) -> list[dict[str, Any]]:
    return [tool.describe() for tool in container.registry.all()]


@router.get("/{slug}")
async def get_tool(slug: str, container: ContainerDep) -> dict[str, Any]:
    return container.registry.get(slug).describe()
