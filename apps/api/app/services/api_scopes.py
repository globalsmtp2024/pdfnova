from app.core.errors import PermissionDeniedError

ALL_SCOPES: tuple[str, ...] = (
    "tasks:read",
    "tasks:write",
    "library:read",
    "library:write",
    "esign:read",
    "esign:write",
    "teams:read",
    "teams:write",
    "webhooks:manage",
)
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
NEVER_FOR_KEYS = "account"
PREFIX_SCOPES: tuple[tuple[str, str], ...] = (
    ("/api/v1/tasks", "tasks"),
    ("/api/v1/files", "tasks"),
    ("/api/v1/uploads", "tasks"),
    ("/api/v1/library", "library"),
    ("/api/v1/schedules", "tasks"),
    ("/api/v1/cloud", "library"),
    ("/api/v1/esign/requests", "esign"),
    ("/api/v1/teams", "teams"),
    ("/api/v1/webhooks", "webhooks"),
)
ACCOUNT_PREFIXES = ("/api/v1/me", "/api/v1/auth", "/api/v1/admin")


def required_scope(method: str, path: str) -> str | None:
    if path.startswith(ACCOUNT_PREFIXES):
        return NEVER_FOR_KEYS
    for prefix, family in PREFIX_SCOPES:
        if path.startswith(prefix):
            if family == "webhooks":
                return "webhooks:manage"
            return f"{family}:{'read' if method in SAFE_METHODS else 'write'}"
    return None


def clean_scopes(scopes: list[str] | None) -> list[str] | None:
    if scopes is None:
        return None
    unknown = [scope for scope in scopes if scope not in ALL_SCOPES]
    if unknown:
        raise ValueError(f"Unknown scope: {unknown[0]}")
    return sorted(set(scopes))


def enforce(scopes: list[str] | None, method: str, path: str) -> None:
    needed = required_scope(method, path)
    if needed is None:
        return
    if needed == NEVER_FOR_KEYS:
        raise PermissionDeniedError(
            "API keys cannot manage your account.", hint="Use the website to change account settings."
        )
    granted = set(ALL_SCOPES) if scopes is None else set(scopes)
    if needed in granted:
        return
    if needed.endswith(":read") and needed.replace(":read", ":write") in granted:
        return
    raise PermissionDeniedError(
        f"This API key does not have the “{needed}” scope.",
        hint="Create a key with that scope in your dashboard.",
    )
