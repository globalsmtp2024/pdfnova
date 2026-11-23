import re
import subprocess
import sys

numbers = [int(x) for x in sys.argv[1].split(",")]
slugs = [x for x in sys.argv[2].split(",") if x]
message = sys.argv[3]
queue = open("docs/QUEUE.md", encoding="utf8").read()
for number in numbers:
    queue = re.sub(rf"- \[ \] {number} ", f"- [x] {number} ", queue)
open("docs/QUEUE.md", "w", encoding="utf8", newline="\n").write(queue)
live = open("apps/web/src/config/live.ts", encoding="utf8").read()
for slug in slugs:
    if f'"{slug}"' not in live:
        live = live.replace("]);", f'  "{slug}",\n]);')
open("apps/web/src/config/live.ts", "w", encoding="utf8", newline="\n").write(live)
subprocess.run(["node", "scripts/fields.mjs"], cwd="apps/web", check=True)
subprocess.run(["node", "scripts/toolnames.mjs"], cwd="apps/web", check=True)
subprocess.run(["npx", "prettier", "--write", "messages"], cwd="apps/web", check=True, shell=True, capture_output=True)
subprocess.run(["git", "add", "-A"], check=True)
subprocess.run(
    ["git", "commit", "-q", "-m", message + "\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"],
    check=True,
)
print(subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip())
