import ipaddress
import socket
from urllib.parse import urlsplit

MAX_BASE_URL_LENGTH = 300


class EndpointError(ValueError):
    pass


def normalize_base_url(value: str) -> str:
    cleaned = value.strip().rstrip("/")
    if not cleaned or len(cleaned) > MAX_BASE_URL_LENGTH:
        raise EndpointError("Enter the base URL of your OpenAI-compatible server.")
    parts = urlsplit(cleaned)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise EndpointError("The base URL must start with http:// or https://.")
    if parts.username or parts.password or parts.query or parts.fragment:
        raise EndpointError("The base URL can't contain credentials, a query or a fragment.")
    return cleaned


def chat_completions_url(base_url: str) -> str:
    if base_url.endswith("/v1"):
        return f"{base_url}/chat/completions"
    return f"{base_url}/v1/chat/completions"


def assert_allowed_host(base_url: str, allow_private: bool) -> None:
    if allow_private:
        return
    parts = urlsplit(base_url)
    host = parts.hostname or ""
    port = parts.port or (443 if parts.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port)
    except socket.gaierror as exc:
        raise EndpointError("That server address could not be found.") from exc
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise EndpointError(
                "That address points at a private network. Self-hosted servers can allow this "
                "with AI_CUSTOM_ALLOW_PRIVATE."
            )
