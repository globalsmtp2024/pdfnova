import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web"
sys.path.insert(0, str(ROOT / "apps" / "api"))

CATALOG = (WEB / "src/config/tools.ts").read_text(encoding="utf8")
LIVE = (WEB / "src/config/live.ts").read_text(encoding="utf8")
REGISTRY = (WEB / "src/components/tools/panels/registry.ts").read_text(encoding="utf8")
CONTENT = (WEB / "src/content/tools-content.ts").read_text(encoding="utf8")
CONTENT_UR = (WEB / "src/content/tools-content.ur.ts").read_text(encoding="utf8")
SMOKE = (ROOT / "scripts/smoke_tools.py").read_text(encoding="utf8")
EN = json.loads((WEB / "messages/en.json").read_text(encoding="utf8"))
UR = json.loads((WEB / "messages/ur.json").read_text(encoding="utf8"))


def catalog_slugs() -> list[str]:
    seen: list[str] = []
    for match in re.finditer(r'\btool\(\s*"([a-z0-9-]+)"', CATALOG):
        if match.group(1) not in seen:
            seen.append(match.group(1))
    return seen


def backend_slugs() -> set[str]:
    from app.tools.registry import get_registry

    registry = get_registry()
    return {
        slug
        for slug in re.findall(r'"([a-z0-9-]+)"', CATALOG)
        if slug in registry
    } | {name for name in dir(registry) if False}


def has_key(source: str, slug: str) -> bool:
    return bool(re.search(rf'(^|\s)"?{re.escape(slug)}"?\s*:', source, re.M))


def main() -> int:
    slugs = catalog_slugs()
    backend = backend_slugs()
    rows: list[tuple[str, dict[str, str]]] = []
    gaps = 0
    for slug in slugs:
        has_backend = slug in backend
        report = {
            "backend": "yes" if has_backend else "NO",
            "panel": "dedicated" if has_key(REGISTRY, slug) else ("schema" if has_backend else "NO"),
            "en": "yes" if slug in EN.get("tools", {}) or slug in CATALOG else "NO",
            "ur": "yes" if slug in UR.get("tools", {}) else "NO",
            "content": "override" if has_key(CONTENT, slug) else ("ur-override" if has_key(CONTENT_UR, slug) else "category"),
            "smoke": "yes" if re.search(rf'Case\(\s*"{re.escape(slug)}"', SMOKE) else "NO",
            "live": "yes" if f'"{slug}"' in LIVE else "no",
        }
        if has_backend:
            gaps += sum(1 for key in ("ur", "smoke", "live") if report[key] in {"NO", "no"})
        else:
            gaps += 1 if report["live"] == "yes" else 0
        rows.append((slug, report))
    header = ["slug", "backend", "panel", "en", "ur", "content", "smoke", "live"]
    print(" | ".join(f"{name:<22}" if index == 0 else f"{name:<9}" for index, name in enumerate(header)))
    for slug, report in rows:
        print(" | ".join([f"{slug:<22}"] + [f"{report[name]:<9}" for name in header[1:]]))
    missing_backend = [slug for slug, report in rows if report["backend"] == "NO"]
    print(f"\n{len(slugs)} catalog tools, {len(slugs) - len(missing_backend)} with a backend plugin, {gaps} gaps")
    print("no backend:", ", ".join(missing_backend) or "none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
