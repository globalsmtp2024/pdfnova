import re
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "components"

PLAN = {
    "account/dashboard.tsx": {257: ("Ban", "icon")},
    "account/onboarding.tsx": {105: ("ArrowLeft", "icon", True), 112: ("ArrowRight", "iconEnd", True)},
    "account/settings.tsx": {
        73: ("Save", "icon"),
        175: ("ShieldCheck", "icon"),
        216: ("ShieldCheck", "icon"),
        266: ("ShieldOff", "icon"),
        335: ("KeyRound", "icon"),
        377: ("LogOut", "icon"),
        662: ("Trash2", "icon"),
    },
    "admin/admin-page.tsx": {311: ("Save", "icon"), 365: ("Check", "icon"), 377: ("X", "icon"), 479: ("Save", "icon")},
    "cloud/cloud-browser.tsx": {122: ("Check", "icon")},
    "cloud/cloud-connections.tsx": {30: ("Unplug", "icon"), 38: ("Link2", "icon")},
    "esign/esign-new.tsx": {467: ("ArrowLeft", "icon", True), 472: ("ArrowRight", "iconEnd", True), 486: ("Send", "icon")},
    "esign/esign-sign.tsx": {
        146: ("Eraser", "icon"),
        151: ("X", "icon"),
        155: ("Check", "icon"),
        265: ("ChevronLeft", "icon", True),
        277: ("ChevronRight", "iconEnd", True),
        348: ("CircleCheck", "icon"),
        358: ("Ban", "icon"),
        383: ("Ban", "icon"),
        396: ("X", "icon"),
    },
    "library/library-page.tsx": {185: ("Save", "icon")},
    "marketing/hero.tsx": {74: ("Eraser", "icon")},
    "private/private-mode.tsx": {333: ("Play", "icon")},
    "schedules/schedules-page.tsx": {258: ("Power", "icon")},
    "teams/accept-invite.tsx": {56: ("UserCheck", "icon")},
    "tools/batch-runner.tsx": {222: ("Play", "icon"), 233: ("Square", "icon"), 257: ("Eraser", "icon")},
    "tools/organize-editor.tsx": {351: ("ArrowUpDown", "icon")},
    "tools/panels/edit-pdf.tsx": {936: ("Replace", "icon")},
    "tools/panels/workflow.tsx": {471: ("Save", "icon")},
    "tools/password-prompt.tsx": {85: ("LockOpen", "icon")},
    "tools/tool-workspace.tsx": {
        112: ("Link2", "icon"),
        240: ("X", "icon"),
        279: ("RotateCcw", "icon"),
        282: ("Undo2", "icon"),
        432: ("Play", "icon"),
    },
    "webhooks/webhooks-page.tsx": {287: ("Power", "icon")},
}


def add_imports(text, names):
    match = re.search(r'import \{([^}]*)\} from "lucide-react";', text)
    if match:
        existing = {part.strip() for part in match.group(1).split(",") if part.strip()}
        merged = sorted(existing | names, key=lambda item: item.lower())
        replacement = "import { " + ", ".join(merged) + ' } from "lucide-react";'
        return text[: match.start()] + replacement + text[match.end() :]
    line = "import { " + ", ".join(sorted(names)) + ' } from "lucide-react";\n'
    first_import = re.search(r"^import .*$", text, re.M)
    insert_at = first_import.start() if first_import else 0
    if text.startswith('"use client";'):
        insert_at = text.index("\n", 0) + 1
        while text[insert_at] == "\n":
            insert_at += 1
    return text[:insert_at] + line + text[insert_at:]


for relative, entries in PLAN.items():
    path = SRC / relative
    text = path.read_text(encoding="utf8")
    lines = text.split("\n")
    names = set()
    for line_number, spec in entries.items():
        icon, prop = spec[0], spec[1]
        mirror = len(spec) > 2 and spec[2]
        index = line_number - 1
        assert "<Button" in lines[index], (relative, line_number, lines[index])
        extra = f" {prop}={{<{icon} />}}" + (" mirrorIcon" if mirror else "")
        lines[index] = lines[index].replace("<Button", "<Button" + extra, 1)
        names.add(icon)
    text = add_imports("\n".join(lines), names)
    path.write_text(text, encoding="utf8")
print("done")
