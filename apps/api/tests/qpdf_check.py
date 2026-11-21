import glob
import os
import shutil
import subprocess
from functools import cache
from pathlib import Path

WINDOWS_PATTERN = r"C:\Program Files\qpdf*\bin\qpdf.exe"


class QpdfMissingError(RuntimeError):
    pass


@cache
def qpdf_binary() -> str:
    configured = os.environ.get("QPDF_BINARY")
    if configured and Path(configured).is_file():
        return configured
    found = shutil.which("qpdf")
    if found:
        return found
    installed = sorted(glob.glob(WINDOWS_PATTERN))
    if installed:
        return installed[-1]
    raise QpdfMissingError(
        "qpdf is not installed. Install it (winget install QPDF.QPDF, apt install qpdf) or set QPDF_BINARY."
    )


def assert_qpdf_ok(path: Path, password: str | None = None) -> None:
    command = [qpdf_binary(), "--check"]
    if password is not None:
        command.append(f"--password={password}")
    command.append(str(path))
    result = subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)
    assert result.returncode == 0, f"qpdf --check failed for {path.name}:\n{result.stdout}\n{result.stderr}"
