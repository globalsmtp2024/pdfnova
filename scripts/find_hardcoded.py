import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "apps" / "web" / "src"
ATTRIBUTES = re.compile(r'\b(label|placeholder|title|aria-label|alt|description|hint|subtitle|summary|error)=["\']([^"\'{}]*[A-Za-z]{3,}[^"\'{}]*)["\']')
TEXT_NODE = re.compile(r">\s*([A-Z][A-Za-z0-9 ,.'’!?&:/()\-]{3,})\s*<")
SKIP_DIRS = {"content"}
SKIP_FILES = {"layout.tsx", "global-not-found.tsx", "opengraph-image.tsx", "manifest.ts"}
IGNORE_TEXT = re.compile(r"^(PDFNova|PDF|JPG|PNG|WebP|API|URL|OK|CSV|JSON|ZIP|EPUB|OCR|AI|Ctrl|Shift|Alt|Esc|Enter)$")


def findings(path: Path) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    for number, line in enumerate(path.read_text(encoding="utf8").splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith(("import ", "//", "*", "export type", "type ")):
            continue
        for match in ATTRIBUTES.finditer(line):
            value = match.group(2)
            if re.search(r"[a-z]+[-_.][a-z]+", value) and " " not in value:
                continue
            found.append((number, f'{match.group(1)}="{value}"'))
        for match in TEXT_NODE.finditer(line):
            text = match.group(1).strip()
            if " " in text or text[0].isupper() and len(text) > 5:
                if not IGNORE_TEXT.match(text):
                    found.append((number, f">{text}<"))
    return found


def main() -> int:
    verbose = "-v" in sys.argv
    total = 0
    for path in sorted(ROOT.rglob("*.tsx")):
        if path.name in SKIP_FILES or ".test." in path.name or any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        items = findings(path)
        if not items:
            continue
        total += len(items)
        print(f"{len(items):4d}  {path.relative_to(ROOT)}")
        if verbose:
            for number, text in items[:60]:
                print(f"        {number}: {text}")
    print(f"total {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
