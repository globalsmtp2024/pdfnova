import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer


def answer(prompt: str) -> str:
    if "Translate each string" in prompt:
        match = re.search(r"\n(\[.*\])\s*$", prompt, re.S)
        lines = json.loads(match.group(1)) if match else []
        return json.dumps([f"ترجمہ {line}" for line in lines], ensure_ascii=False)
    if "List every exact string" in prompt:
        return '["fox"]'
    if "flat JSON object" in prompt:
        return '{"title": "Smoke", "pages": 3}'
    return "Stub answer with a citation (p. 1)."


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        prompt = body["messages"][0]["content"]
        payload = json.dumps({"content": [{"type": "text", "text": answer(prompt)}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args: object) -> None:
        return


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8799), Handler).serve_forever()
