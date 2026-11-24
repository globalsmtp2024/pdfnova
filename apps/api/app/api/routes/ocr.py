from fastapi import APIRouter

from app.tools.convert.ocr import installed_languages

router = APIRouter(prefix="/api/v1/ocr", tags=["ocr"])


@router.get("/languages")
async def ocr_languages() -> dict[str, list[str]]:
    return {"languages": list(installed_languages())}
