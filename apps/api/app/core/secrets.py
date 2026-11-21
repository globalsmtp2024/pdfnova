import json
from typing import Any

from app.core.config import Settings
from app.core.crypto import load_key, open_text, seal_text


def seal_secrets(settings: Settings, payload: dict[str, Any]) -> str:
    key = load_key(settings.storage_encryption_key.get_secret_value())
    return seal_text(key, json.dumps(payload))


def open_secrets(settings: Settings, sealed: str | None) -> dict[str, Any]:
    if not sealed:
        return {}
    key = load_key(settings.storage_encryption_key.get_secret_value())
    loaded = json.loads(open_text(key, sealed))
    return loaded if isinstance(loaded, dict) else {}
