import re
from urllib.parse import parse_qs, urlparse

import httpx
import pyotp
import respx

from app.container import Container
from app.services.email import OutgoingEmail
from tests.conftest import CsrfClient

PASSWORD = "Sturdy-Passphrase-42"


def _token_from(email: OutgoingEmail) -> str:
    match = re.search(r"token=([A-Za-z0-9_\-]+)", email.text)
    assert match
    return match.group(1)


async def _register(client: CsrfClient, email: str = "ayesha@example.com") -> dict:
    response = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": PASSWORD, "display_name": "Ayesha"}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_register_login_me_logout(client: CsrfClient, outbox: list[OutgoingEmail]) -> None:
    body = await _register(client, "Ayesha@Example.com")
    assert body["user"]["email"] == "ayesha@example.com"
    assert body["user"]["email_verified"] is False
    assert "plan" not in body["user"]
    assert body["user"]["retention_seconds"] == 3600 and body["user"]["ai_key"] is None
    assert "pn_access" in client.cookies and "pn_refresh" in client.cookies
    assert len(outbox) == 1 and "Confirm" in outbox[0].subject
    assert (await client.get("/api/v1/auth/me")).json()["display_name"] == "Ayesha"
    assert (await client.post("/api/v1/auth/logout")).status_code == 200
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    duplicate = await client.post(
        "/api/v1/auth/register", json={"email": "ayesha@example.com", "password": PASSWORD}
    )
    assert duplicate.status_code == 409
    login = await client.post(
        "/api/v1/auth/login", json={"email": "AYESHA@example.com", "password": PASSWORD}
    )
    assert login.status_code == 200 and login.json()["mfa_required"] is False
    assert (await client.get("/api/v1/auth/me")).status_code == 200


async def test_weak_passwords_rejected(client: CsrfClient) -> None:
    for password in ["short", "aaaaaaaaaaaa", "bilal-secret-pass"]:
        response = await client.post(
            "/api/v1/auth/register", json={"email": "bilal@example.com", "password": password}
        )
        assert response.status_code == 422, password
        assert response.json()["error"]["code"] == "weak_password"


async def test_login_failures_and_lockout(client: CsrfClient) -> None:
    await _register(client)
    await client.post("/api/v1/auth/logout")
    wrong = await client.post(
        "/api/v1/auth/login", json={"email": "ayesha@example.com", "password": "nope-nope-nope"}
    )
    assert wrong.status_code == 401 and wrong.json()["error"]["hint"]
    unknown = await client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": PASSWORD}
    )
    assert unknown.status_code == 401
    assert unknown.json()["error"]["message"] == wrong.json()["error"]["message"]
    for _ in range(9):
        await client.post(
            "/api/v1/auth/login", json={"email": "ayesha@example.com", "password": "nope-nope-nope"}
        )
    locked = await client.post(
        "/api/v1/auth/login", json={"email": "ayesha@example.com", "password": PASSWORD}
    )
    assert locked.status_code == 401 and "Too many" in locked.json()["error"]["message"]


async def test_auth_rate_limit(client: CsrfClient) -> None:
    statuses = [
        (
            await client.post("/api/v1/auth/login", json={"email": "x@example.com", "password": "whatever"})
        ).status_code
        for _ in range(21)
    ]
    assert statuses[-1] == 429


async def test_refresh_rotation_and_reuse_detection(client: CsrfClient) -> None:
    await _register(client)
    original_refresh = client.cookies.get("pn_refresh")
    rotated = await client.post("/api/v1/auth/refresh")
    assert rotated.status_code == 200
    new_refresh = client.cookies.get("pn_refresh")
    assert new_refresh and new_refresh != original_refresh
    client.cookies.set("pn_refresh", original_refresh, path="/api/v1/auth")
    reused = await client.post("/api/v1/auth/refresh")
    assert reused.status_code == 401
    client.cookies.set("pn_refresh", new_refresh, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_email_verification(client: CsrfClient, outbox: list[OutgoingEmail]) -> None:
    await _register(client)
    token = _token_from(outbox[0])
    verified = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert verified.status_code == 200 and verified.json()["email_verified"] is True
    assert (await client.post("/api/v1/auth/verify-email", json={"token": token})).status_code == 400
    assert (await client.post("/api/v1/auth/verify-email/resend")).status_code == 200
    assert len(outbox) == 1


async def test_password_reset_flow(client: CsrfClient, outbox: list[OutgoingEmail]) -> None:
    await _register(client)
    response = await client.post("/api/v1/auth/password/forgot", json={"email": "ayesha@example.com"})
    assert response.status_code == 202
    assert (
        await client.post("/api/v1/auth/password/forgot", json={"email": "ghost@example.com"})
    ).status_code == 202
    assert len(outbox) == 2
    token = _token_from(outbox[1])
    reset = await client.post(
        "/api/v1/auth/password/reset", json={"token": token, "password": "Brand-New-Secret-77"}
    )
    assert reset.status_code == 200
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    old = await client.post("/api/v1/auth/login", json={"email": "ayesha@example.com", "password": PASSWORD})
    assert old.status_code == 401
    new = await client.post(
        "/api/v1/auth/login", json={"email": "ayesha@example.com", "password": "Brand-New-Secret-77"}
    )
    assert new.status_code == 200
    assert (
        await client.post(
            "/api/v1/auth/password/reset", json={"token": token, "password": "Another-Secret-88"}
        )
    ).status_code == 400


async def test_change_password(client: CsrfClient) -> None:
    await _register(client)
    bad = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": "wrong", "new_password": "Changed-Secret-99"},
    )
    assert bad.status_code == 401
    good = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": PASSWORD, "new_password": "Changed-Secret-99"},
    )
    assert good.status_code == 200
    assert (await client.get("/api/v1/auth/me")).status_code == 200


async def test_totp_two_factor_flow(client: CsrfClient) -> None:
    await _register(client)
    setup = (await client.post("/api/v1/auth/mfa/setup")).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/")
    totp = pyotp.TOTP(setup["secret"])
    assert (await client.post("/api/v1/auth/mfa/enable", json={"code": "000000"})).status_code == 400
    enabled = await client.post("/api/v1/auth/mfa/enable", json={"code": totp.now()})
    assert enabled.status_code == 200
    recovery_codes = enabled.json()["recovery_codes"]
    assert len(recovery_codes) == 10
    await client.post("/api/v1/auth/logout")

    first = (
        await client.post("/api/v1/auth/login", json={"email": "ayesha@example.com", "password": PASSWORD})
    ).json()
    assert first["mfa_required"] is True and first["user"] is None
    assert "pn_access" not in client.cookies
    rejected = await client.post(
        "/api/v1/auth/mfa/login", json={"mfa_token": first["mfa_token"], "code": "123456"}
    )
    assert rejected.status_code == 401
    accepted = await client.post(
        "/api/v1/auth/mfa/login", json={"mfa_token": first["mfa_token"], "code": totp.now()}
    )
    assert accepted.status_code == 200 and accepted.json()["user"]["totp_enabled"] is True
    await client.post("/api/v1/auth/logout")

    second = (
        await client.post("/api/v1/auth/login", json={"email": "ayesha@example.com", "password": PASSWORD})
    ).json()
    via_recovery = await client.post(
        "/api/v1/auth/mfa/login", json={"mfa_token": second["mfa_token"], "code": recovery_codes[0]}
    )
    assert via_recovery.status_code == 200
    third = (
        await client.post("/api/v1/auth/login", json={"email": "ayesha@example.com", "password": PASSWORD})
    ).json()
    reused = await client.post(
        "/api/v1/auth/mfa/login", json={"mfa_token": third["mfa_token"], "code": recovery_codes[0]}
    )
    assert reused.status_code == 401

    disabled = await client.post("/api/v1/auth/mfa/disable", json={"password": PASSWORD, "code": totp.now()})
    assert disabled.status_code == 200 and disabled.json()["totp_enabled"] is False


async def test_csrf_required_for_cookie_requests(client: CsrfClient) -> None:
    await _register(client)
    client.skip_csrf = True  # type: ignore[attr-defined]
    blocked = await client.post("/api/v1/auth/logout")
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "csrf_failed"
    allowed = await client.post("/api/v1/auth/logout", headers={"x-csrf-token": client.cookies["pn_csrf"]})
    assert allowed.status_code == 200


async def test_oauth_providers_listed_when_configured(client: CsrfClient) -> None:
    assert (await client.get("/api/v1/auth/providers")).json() == {"providers": ["google", "github"]}


async def test_security_headers(client: CsrfClient) -> None:
    response = await client.get("/health/live")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in response.headers["content-security-policy"]
    assert response.headers["x-request-id"]


@respx.mock
async def test_google_oauth_creates_and_links_account(client: CsrfClient, container: Container) -> None:
    start = await client.get("/api/v1/auth/oauth/google/start", follow_redirects=False)
    assert start.status_code == 302
    location = urlparse(start.headers["location"])
    params = parse_qs(location.query)
    assert location.netloc == "accounts.google.com"
    assert params["code_challenge_method"] == ["S256"]
    state = params["state"][0]
    respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=httpx.Response(200, json={"access_token": "g-token"})
    )
    respx.get("https://openidconnect.googleapis.com/v1/userinfo").mock(
        return_value=httpx.Response(
            200, json={"sub": "g-123", "email": "Zara@Example.com", "email_verified": True, "name": "Zara"}
        )
    )
    bad_state = await client.get(
        "/api/v1/auth/oauth/google/callback?code=abc&state=wrong", follow_redirects=False
    )
    assert bad_state.headers["location"].endswith("/auth/login?error=oauth")
    start = await client.get("/api/v1/auth/oauth/google/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = await client.get(
        f"/api/v1/auth/oauth/google/callback?code=abc&state={state}", follow_redirects=False
    )
    assert callback.status_code == 302 and callback.headers["location"] == "http://web.test/"
    me = (await client.get("/api/v1/auth/me")).json()
    assert me["email"] == "zara@example.com" and me["email_verified"] is True and me["has_password"] is False


@respx.mock
async def test_github_oauth_requires_verified_email(client: CsrfClient) -> None:
    respx.post("https://github.com/login/oauth/access_token").mock(
        return_value=httpx.Response(200, json={"access_token": "t"})
    )
    respx.get("https://api.github.com/user").mock(
        return_value=httpx.Response(200, json={"id": 77, "login": "omar"})
    )
    respx.get("https://api.github.com/user/emails").mock(
        return_value=httpx.Response(
            200, json=[{"email": "omar@example.com", "primary": True, "verified": False}]
        )
    )
    start = await client.get("/api/v1/auth/oauth/github/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = await client.get(
        f"/api/v1/auth/oauth/github/callback?code=c&state={state}", follow_redirects=False
    )
    assert callback.headers["location"].endswith("/auth/login?error=oauth")
    assert (await client.get("/api/v1/auth/oauth/unknown/start")).status_code == 404


@respx.mock
async def test_oauth_takeover_of_unverified_account_invalidates_password(client: CsrfClient) -> None:
    await _register(client, "victim@example.com")
    await client.post("/api/v1/auth/logout")
    respx.post("https://github.com/login/oauth/access_token").mock(
        return_value=httpx.Response(200, json={"access_token": "t"})
    )
    respx.get("https://api.github.com/user").mock(
        return_value=httpx.Response(200, json={"id": 5, "login": "victim"})
    )
    respx.get("https://api.github.com/user/emails").mock(
        return_value=httpx.Response(
            200, json=[{"email": "victim@example.com", "primary": True, "verified": True}]
        )
    )
    start = await client.get("/api/v1/auth/oauth/github/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    await client.get(f"/api/v1/auth/oauth/github/callback?code=c&state={state}", follow_redirects=False)
    assert (await client.get("/api/v1/auth/me")).json()["has_password"] is False
    await client.post("/api/v1/auth/logout")
    squatter = await client.post(
        "/api/v1/auth/login", json={"email": "victim@example.com", "password": PASSWORD}
    )
    assert squatter.status_code == 401
