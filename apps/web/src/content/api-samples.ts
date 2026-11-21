import type { CodeSample } from "@/components/ui/code-block";
import { siteUrl } from "@/config/site";

export function mergeSamples(baseUrl: string = siteUrl): CodeSample[] {
  return [
    {
      id: "curl",
      label: "curl",
      code: `KEY="pnk_your_api_key"
API="${baseUrl}/api/v1"

TASK=$(curl -s -X POST "$API/tasks" \\
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"tool":"merge"}' | jq -r .id)

curl -s -X POST "$API/tasks/$TASK/files" -H "Authorization: Bearer $KEY" -F file=@a.pdf
curl -s -X POST "$API/tasks/$TASK/files" -H "Authorization: Bearer $KEY" -F file=@b.pdf

curl -s -X POST "$API/tasks/$TASK/start" \\
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"options":{"add_bookmarks":true}}'

curl -N "$API/tasks/$TASK/events" -H "Authorization: Bearer $KEY"
curl -s "$API/tasks/$TASK" -H "Authorization: Bearer $KEY" | jq -r '.outputs[0].download_url'`,
    },
    {
      id: "python",
      label: "Python",
      code: `import time
import httpx

API = "${baseUrl}/api/v1"
headers = {"Authorization": "Bearer pnk_your_api_key"}

with httpx.Client(base_url=API, headers=headers, timeout=60) as client:
    task = client.post("/tasks", json={"tool": "merge"}).json()
    for path in ("a.pdf", "b.pdf"):
        with open(path, "rb") as handle:
            client.post(f"/tasks/{task['id']}/files", files={"file": (path, handle, "application/pdf")})
    client.post(f"/tasks/{task['id']}/start", json={"options": {"add_bookmarks": True}})
    while (state := client.get(f"/tasks/{task['id']}").json())["status"] in {"queued", "running"}:
        time.sleep(1)
    print(state["outputs"][0]["download_url"])`,
    },
    {
      id: "javascript",
      label: "JavaScript",
      code: `const API = "${baseUrl}/api/v1";
const headers = { Authorization: "Bearer pnk_your_api_key" };

const task = await fetch(\`\${API}/tasks\`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ tool: "merge" }),
}).then((response) => response.json());

for (const file of files) {
  const form = new FormData();
  form.append("file", file);
  await fetch(\`\${API}/tasks/\${task.id}/files\`, { method: "POST", headers, body: form });
}

await fetch(\`\${API}/tasks/\${task.id}/start\`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ options: { add_bookmarks: true } }),
});`,
    },
  ];
}
