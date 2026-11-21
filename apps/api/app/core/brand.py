import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel


class Brand(BaseModel):
    name: str
    tagline: str
    domain: str
    support_email: str


def _brand_file_candidates() -> list[Path]:
    here = Path(__file__).resolve()
    candidates = [Path(p) for p in [os.environ.get("BRAND_FILE", "")] if p]
    candidates.extend(parent / "packages" / "shared" / "brand.json" for parent in here.parents)
    candidates.append(Path("/app/brand.json"))
    return candidates


@lru_cache
def get_brand() -> Brand:
    for candidate in _brand_file_candidates():
        if candidate.is_file():
            raw = json.loads(candidate.read_text(encoding="utf-8"))
            return Brand(
                name=raw["name"],
                tagline=raw["tagline"],
                domain=raw["domain"],
                support_email=raw["supportEmail"],
            )
    raise RuntimeError("brand.json not found; set BRAND_FILE")
