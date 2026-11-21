from functools import partial

import httpx
import pytest

from app.container import Container
from app.core.errors import PayloadTooLargeError
from app.services.url_import import UrlImportError, fetch_url, is_public_address
from tests.conftest import CsrfClient
from tests.pdf_factory import pdf_bytes

PUBLIC_IP = "93.184.215.14"


def resolver_for(mapping: dict[str, list[str]]):
    async def resolve(host: str, port: int) -> list[str]:
        if host not in mapping:
            raise OSError("not found")
        return mapping[host]

    return resolve


@pytest.mark.parametrize(
    ("address", "public"),
    [
        ("93.184.215.14", True),
        ("2606:4700::6810:84e5", True),
        ("127.0.0.1", False),
        ("10.1.2.3", False),
        ("172.16.0.1", False),
        ("192.168.1.10", False),
        ("169.254.169.254", False),
        ("100.64.0.1", False),
        ("0.0.0.0", False),
        ("::1", False),
        ("fd00::1", False),
        ("fe80::1", False),
        ("::ffff:127.0.0.1", False),
        ("224.0.0.1", False),
        ("not-an-ip", False),
    ],
)
def test_public_address_classification(address: str, public: bool) -> None:
    assert is_public_address(address) is public


async def test_fetch_pins_resolved_address_and_names_file() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            content=b"%PDF-1.7 data",
            headers={"content-disposition": "attachment; filename*=UTF-8''Annual%20report.pdf"},
        )

    result = await fetch_url(
        "https://docs.example.com/files/download?id=7",
        1024,
        resolver=resolver_for({"docs.example.com": [PUBLIC_IP]}),
        transport=httpx.MockTransport(handler),
    )
    assert result.filename == "Annual report.pdf" and result.data == b"%PDF-1.7 data"
    assert seen[0].url.host == PUBLIC_IP and seen[0].headers["host"] == "docs.example.com"
    assert seen[0].extensions["sni_hostname"] == "docs.example.com"


@pytest.mark.parametrize(
    ("url", "mapping", "message"),
    [
        ("ftp://example.com/a.pdf", {}, "Only http and https"),
        ("http://user:pw@example.com/a.pdf", {}, "embedded usernames"),
        ("http://example.com:22/a.pdf", {}, "unusual ports"),
        ("http://127.0.0.1/a.pdf", {}, "private or internal"),
        ("http://[::1]/a.pdf", {}, "private or internal"),
        ("http://metadata.internal/a.pdf", {"metadata.internal": ["169.254.169.254"]}, "private or internal"),
        (
            "http://mixed.example.com/a.pdf",
            {"mixed.example.com": [PUBLIC_IP, "10.0.0.5"]},
            "private or internal",
        ),
        ("http://missing.example.com/a.pdf", {}, "could not find"),
    ],
)
async def test_fetch_rejects_unsafe_targets(url: str, mapping: dict[str, list[str]], message: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request should be sent")

    with pytest.raises(UrlImportError, match=message):
        await fetch_url(url, 1024, resolver=resolver_for(mapping), transport=httpx.MockTransport(handler))


async def test_fetch_revalidates_redirects() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://internal.example.com/secret"})

    resolver = resolver_for({"public.example.com": [PUBLIC_IP], "internal.example.com": ["10.0.0.8"]})
    with pytest.raises(UrlImportError, match="private or internal"):
        await fetch_url(
            "http://public.example.com/start", 1024, resolver=resolver, transport=httpx.MockTransport(handler)
        )


async def test_fetch_enforces_size_and_redirect_limits() -> None:
    resolver = resolver_for({"big.example.com": [PUBLIC_IP]})
    large = httpx.MockTransport(lambda request: httpx.Response(200, content=b"x" * 2048))
    with pytest.raises(PayloadTooLargeError):
        await fetch_url("http://big.example.com/a.pdf", 1024, resolver=resolver, transport=large)
    looping = httpx.MockTransport(lambda request: httpx.Response(301, headers={"location": "/again"}))
    with pytest.raises(UrlImportError, match="too many times"):
        await fetch_url("http://big.example.com/a.pdf", 1024, resolver=resolver, transport=looping)
    failing = httpx.MockTransport(lambda request: httpx.Response(404))
    with pytest.raises(UrlImportError, match="404"):
        await fetch_url("http://big.example.com/a.pdf", 1024, resolver=resolver, transport=failing)


async def test_import_endpoint_adds_file_to_task(client: CsrfClient, container: Container) -> None:
    document = pdf_bytes(3, "Remote")
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=document))
    container.url_fetcher = partial(
        fetch_url, resolver=resolver_for({"files.example.com": [PUBLIC_IP]}), transport=transport
    )
    task = (await client.post("/api/v1/tasks", json={"tool": "merge"})).json()
    imported = await client.post(
        f"/api/v1/tasks/{task['id']}/imports", json={"url": "https://files.example.com/reports/q3.pdf"}
    )
    assert imported.status_code == 201, imported.text
    body = imported.json()
    assert body["filename"] == "q3.pdf" and body["status"] == "ready" and body["page_count"] == 3
    blocked = await client.post(f"/api/v1/tasks/{task['id']}/imports", json={"url": "http://localhost/admin"})
    assert blocked.status_code == 422 and blocked.json()["error"]["code"] == "url_import_failed"
