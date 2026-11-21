import asyncio
import ipaddress
import re
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import PurePosixPath
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

import httpx

from app.core.errors import AppError, PayloadTooLargeError

MAX_REDIRECTS = 3
CONNECT_TIMEOUT = 10.0
TOTAL_TIMEOUT = 120.0
ALLOWED_PORTS = frozenset({80, 443, 8080, 8443})
_FILENAME_STAR = re.compile(r"filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)")
_FILENAME = re.compile(r'filename\s*=\s*"?([^";]+)"?')

Resolver = Callable[[str, int], Awaitable[list[str]]]


class UrlImportError(AppError):
    status_code = 422
    code = "url_import_failed"


@dataclass(frozen=True)
class ImportedFile:
    filename: str
    data: bytes
    content_type: str


async def system_resolver(host: str, port: int) -> list[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return sorted({str(info[4][0]) for info in infos})


def is_public_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return bool(ip.is_global) and not (
        ip.is_multicast or ip.is_reserved or ip.is_loopback or ip.is_link_local
    )


def _validated_target(url: str) -> tuple[str, str, int]:
    parts = urlsplit(url.strip())
    if parts.scheme not in {"http", "https"}:
        raise UrlImportError("Only http and https links can be imported.")
    if parts.username or parts.password:
        raise UrlImportError("Links with embedded usernames or passwords are not allowed.")
    host = parts.hostname
    if not host:
        raise UrlImportError("This link has no host name.")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise UrlImportError("Links on unusual ports are not allowed.")
    return parts.scheme, host, port


async def _resolve_public(host: str, port: int, resolver: Resolver) -> str:
    try:
        literal = ipaddress.ip_address(host)
        addresses = [str(literal)]
    except ValueError:
        try:
            addresses = await resolver(host, port)
        except OSError as exc:
            raise UrlImportError(
                "We could not find that website.", hint="Check the link and try again."
            ) from exc
    if not addresses or not all(is_public_address(address) for address in addresses):
        raise UrlImportError(
            "This link points to a private or internal address and cannot be imported.",
            hint="Use a publicly reachable link.",
        )
    return addresses[0]


def _filename_from(response: httpx.Response, url: str) -> str:
    disposition = response.headers.get("content-disposition", "")
    match = _FILENAME_STAR.search(disposition) or _FILENAME.search(disposition)
    raw_name = match.group(1) if match else PurePosixPath(urlsplit(url).path).name
    candidate = unquote(raw_name).strip()
    candidate = candidate.replace("/", "_").replace("\\", "_").strip()
    return candidate[:200] or "imported-file"


async def fetch_url(
    url: str,
    max_bytes: int,
    *,
    resolver: Resolver = system_resolver,
    transport: httpx.AsyncBaseTransport | None = None,
) -> ImportedFile:
    current = url.strip()
    async with httpx.AsyncClient(
        transport=transport,
        follow_redirects=False,
        timeout=httpx.Timeout(TOTAL_TIMEOUT, connect=CONNECT_TIMEOUT),
        trust_env=False,
    ) as client:
        for _ in range(MAX_REDIRECTS + 1):
            scheme, host, port = _validated_target(current)
            address = await _resolve_public(host, port, resolver)
            parts = urlsplit(current)
            netloc_host = f"[{address}]" if ":" in address else address
            pinned = urlunsplit((scheme, f"{netloc_host}:{port}", parts.path or "/", parts.query, ""))
            request = client.build_request(
                "GET",
                pinned,
                headers={
                    "Host": host if port in {80, 443} else f"{host}:{port}",
                    "User-Agent": "DocumentImporter/1.0",
                },
                extensions={"sni_hostname": host},
            )
            try:
                response = await client.send(request, stream=True)
            except httpx.HTTPError as exc:
                raise UrlImportError(
                    "We could not download that link.", hint="Check that it is reachable."
                ) from exc
            try:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise UrlImportError("The link redirected without a destination.")
                    current = urljoin(current, location)
                    continue
                if response.status_code != 200:
                    raise UrlImportError(f"The website responded with an error ({response.status_code}).")
                declared = response.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > max_bytes:
                    raise PayloadTooLargeError("The linked file is larger than the per-file limit.")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise PayloadTooLargeError("The linked file is larger than the per-file limit.")
                if not body:
                    raise UrlImportError("The linked file is empty.")
                return ImportedFile(
                    filename=_filename_from(response, current),
                    data=bytes(body),
                    content_type=response.headers.get("content-type", "application/octet-stream"),
                )
            finally:
                await response.aclose()
    raise UrlImportError("The link redirected too many times.")
