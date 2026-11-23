import time
from pathlib import Path
from typing import Any, Optional, Union

import httpx

DEFAULT_BASE_URL = "https://api.pdfnova.app"
TERMINAL = {"succeeded", "failed", "cancelled", "expired"}


class PDFNovaError(Exception):
    def __init__(self, message: str, status: int = 0, code: str = "", hint: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.hint = hint


class TaskFailed(PDFNovaError):
    pass


def _raise_for(response: httpx.Response) -> None:
    if response.status_code < 400:
        return
    try:
        error = response.json().get("error", {})
    except ValueError:
        error = {}
    raise PDFNovaError(
        error.get("message", f"The server answered {response.status_code}."),
        status=response.status_code,
        code=error.get("code", ""),
        hint=error.get("hint"),
    )


class Client:
    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL, timeout: float = 120.0):
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def tools(self) -> list[dict[str, Any]]:
        response = self._http.get("/api/v1/tools")
        _raise_for(response)
        return list(response.json())

    def create_task(self, tool: str) -> dict[str, Any]:
        response = self._http.post("/api/v1/tasks", json={"tool": tool})
        _raise_for(response)
        return dict(response.json())

    def upload(self, task_id: str, path: Union[str, Path]) -> dict[str, Any]:
        file_path = Path(path)
        with file_path.open("rb") as handle:
            response = self._http.post(
                f"/api/v1/tasks/{task_id}/files", files={"file": (file_path.name, handle)}
            )
        _raise_for(response)
        return dict(response.json())

    def start(self, task_id: str, options: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        response = self._http.post(f"/api/v1/tasks/{task_id}/start", json={"options": options or {}})
        _raise_for(response)
        return dict(response.json())

    def task(self, task_id: str) -> dict[str, Any]:
        response = self._http.get(f"/api/v1/tasks/{task_id}")
        _raise_for(response)
        return dict(response.json())

    def wait(self, task_id: str, timeout: float = 600.0, interval: float = 1.0) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        while True:
            current = self.task(task_id)
            if current["status"] in TERMINAL:
                if current["status"] != "succeeded":
                    raise TaskFailed(
                        current.get("error_message") or f"The task {current['status']}.",
                        code=current.get("error_code") or "",
                    )
                return current
            if time.monotonic() > deadline:
                raise PDFNovaError("The task took too long.", code="timeout")
            time.sleep(interval)

    def download(self, output: dict[str, Any], directory: Union[str, Path]) -> Path:
        target = Path(directory) / output["filename"]
        target.parent.mkdir(parents=True, exist_ok=True)
        response = self._http.get(output["download_url"])
        _raise_for(response)
        target.write_bytes(response.content)
        return target

    def run(
        self,
        tool: str,
        files: list[Union[str, Path]],
        options: Optional[dict[str, Any]] = None,
        output_dir: Union[str, Path] = ".",
    ) -> list[Path]:
        task = self.create_task(tool)
        for file in files:
            self.upload(task["id"], file)
        self.start(task["id"], options)
        finished = self.wait(task["id"])
        return [self.download(output, output_dir) for output in finished["outputs"] if output.get("download_url")]
