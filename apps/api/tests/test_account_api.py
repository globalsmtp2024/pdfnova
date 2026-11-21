from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select, update

from app.container import Container
from app.db.base import utcnow
from app.main import create_app
from app.models.task import AiUsageEvent, Task
from app.models.user import ApiKey, ContactMessage, User
from app.services.principal import Principal
from app.services.quota import FairUseLimitError, ensure_ai_quota, record_ai_usage
from tests.conftest import CsrfClient
from tests.pdf_factory import pdf_bytes

PASSWORD = "Sturdy-Passphrase-42"


async def register(client: CsrfClient, email: str = "sana@example.com") -> dict:
    response = await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201
    return response.json()["user"]


async def test_profile_update_and_locale(client: CsrfClient) -> None:
    await register(client)
    updated = (await client.patch("/api/v1/me", json={"display_name": " Sana ", "locale": "ur"})).json()
    assert updated["display_name"] == "Sana" and updated["locale"] == "ur"
    fallback = (await client.patch("/api/v1/me", json={"locale": "xx"})).json()
    assert fallback["locale"] == "en"
    assert (await client.patch("/api/v1/me", json={})).status_code == 200


async def test_bring_your_own_ai_key_is_encrypted(client: CsrfClient, container: Container) -> None:
    user = await register(client)
    secret = "sk-ant-test-0123456789abcdefWXYZ"
    stored = (await client.put("/api/v1/me/ai-key", json={"provider": "anthropic", "api_key": secret})).json()
    assert stored["ai_key"] == {"provider": "anthropic", "last4": "WXYZ"}
    async with container.database.session() as session:
        record = await session.get(User, user["id"])
        assert record is not None and record.ai_api_key_encrypted
        assert secret not in record.ai_api_key_encrypted
    bad_provider = await client.put("/api/v1/me/ai-key", json={"provider": "acme", "api_key": secret})
    assert bad_provider.status_code == 400
    too_short = await client.put("/api/v1/me/ai-key", json={"provider": "openai", "api_key": "short"})
    assert too_short.status_code == 400
    providers = (await client.get("/api/v1/me/ai-providers")).json()["providers"]
    assert "anthropic" in providers
    cleared = (await client.delete("/api/v1/me/ai-key")).json()
    assert cleared["ai_key"] is None


async def test_api_keys_authenticate_without_cookies(
    client: CsrfClient, settings, container: Container
) -> None:
    await register(client)
    created = await client.post("/api/v1/me/api-keys", json={"name": "CI pipeline"})
    assert created.status_code == 201
    key = created.json()
    assert key["secret"].startswith("pnk_") and key["prefix"] == key["secret"][:12]
    listed = (await client.get("/api/v1/me/api-keys")).json()
    assert [item["name"] for item in listed] == ["CI pipeline"] and "secret" not in listed[0]

    transport = httpx.ASGITransport(app=create_app(settings, container))
    headers = {"Authorization": f"Bearer {key['secret']}"}
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=headers) as api:
        task = (await api.post("/api/v1/tasks", json={"tool": "merge"})).json()
        for name in ("a.pdf", "b.pdf"):
            uploaded = await api.post(
                f"/api/v1/tasks/{task['id']}/files",
                files={"file": (name, pdf_bytes(1, name), "application/pdf")},
            )
            assert uploaded.status_code == 201
        started = await api.post(f"/api/v1/tasks/{task['id']}/start", json={"options": {}})
        assert started.status_code == 202
        assert (await api.get("/api/v1/auth/me")).json()["email"] == "sana@example.com"

    await container.queue.drain()
    async with container.database.session() as session:
        stored = await session.get(Task, task["id"])
        assert stored is not None and stored.api_key_id == key["id"] and stored.priority == 0
        api_key = await session.get(ApiKey, key["id"])
        assert api_key is not None and api_key.last_used_at is not None

    usage = (await client.get("/api/v1/me/api-usage")).json()
    assert len(usage["days"]) == 14 and usage["days"][-1]["tasks"] == 1
    assert usage["by_key"] == {key["id"]: 1}

    assert (await client.delete(f"/api/v1/me/api-keys/{key['id']}")).status_code == 204
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=headers) as api:
        rejected = await api.post("/api/v1/tasks", json={"tool": "merge"})
        assert rejected.status_code == 401 and "revoked" in rejected.json()["error"]["message"]
        garbage = await api.get("/api/v1/auth/me", headers={"Authorization": "Bearer pnk_not-a-real-key"})
        assert garbage.status_code == 401
    assert (await client.delete("/api/v1/me/api-keys/does-not-exist")).status_code == 404


async def test_history_export_and_delete_account(client: CsrfClient, container: Container) -> None:
    user = await register(client)
    task = (await client.post("/api/v1/tasks", json={"tool": "merge"})).json()
    await client.post(
        f"/api/v1/tasks/{task['id']}/files",
        files={"file": ("report.pdf", pdf_bytes(1, "R"), "application/pdf")},
    )
    history = (await client.get("/api/v1/me/history")).json()
    assert history[0]["id"] == task["id"] and history[0]["file_names"] == ["report.pdf"]
    exported = await client.get("/api/v1/me/export")
    assert exported.headers["content-disposition"].startswith("attachment")
    payload = exported.json()
    assert payload["account"]["email"] == "sana@example.com" and payload["tasks"][0]["files"] == [
        "report.pdf"
    ]

    wrong = await client.post("/api/v1/me/delete", json={"password": "nope"})
    assert wrong.status_code == 401
    deleted = await client.post("/api/v1/me/delete", json={"password": PASSWORD})
    assert deleted.status_code == 200
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    async with container.database.session() as session:
        assert await session.get(User, user["id"]) is None
        assert await session.get(Task, task["id"]) is None
    assert not container.storage.exists(f"tasks/{task['id']}/in/{history[0]['id']}")


async def test_sessions_can_be_listed_and_revoked(client: CsrfClient, settings, container: Container) -> None:
    await register(client)
    other = CsrfClient(
        transport=httpx.ASGITransport(app=create_app(settings, container)), base_url="http://testserver"
    )
    async with other:
        await other.get("/api/v1/auth/csrf")
        await other.post("/api/v1/auth/login", json={"email": "sana@example.com", "password": PASSWORD})
        sessions = (await client.get("/api/v1/auth/sessions")).json()
        assert len(sessions) == 2 and sum(item["current"] for item in sessions) == 1
        foreign = next(item for item in sessions if not item["current"])
        assert (await client.delete(f"/api/v1/auth/sessions/{foreign['id']}")).status_code == 204
        assert (await other.post("/api/v1/auth/refresh")).status_code == 401
    assert len((await client.get("/api/v1/auth/sessions")).json()) == 1
    assert (await client.delete("/api/v1/auth/sessions/unknown")).status_code == 400


async def test_ai_fair_use_cap(container: Container, fair_use_override) -> None:
    fair_use_override(ai_daily_requests=2)
    guest = Principal(user=None, anon_id="guest-1", client_ip_hash="ip-1")
    async with container.database.session() as session:
        for _ in range(2):
            await ensure_ai_quota(session, guest)
            record_ai_usage(session, guest, "ai-summarize")
        await session.commit()
        with pytest.raises(FairUseLimitError) as caught:
            await ensure_ai_quota(session, guest)
        assert caught.value.details["reason"] == "ai_requests_per_day"
        assert "own AI key" in caught.value.message
        same_ip = Principal(user=None, anon_id="guest-2", client_ip_hash="ip-1")
        with pytest.raises(FairUseLimitError):
            await ensure_ai_quota(session, same_ip)
        await session.execute(update(AiUsageEvent).values(created_at=utcnow() - timedelta(days=2)))
        await session.commit()
        await ensure_ai_quota(session, guest)
        owner = User(email="byok@example.com", ai_api_key_encrypted="sealed", ai_key_last4="abcd")
        session.add(owner)
        await session.flush()
        byok = Principal(user=owner, anon_id=None, client_ip_hash="ip-9")
        for _ in range(5):
            await ensure_ai_quota(session, byok)
            record_ai_usage(session, byok, "ai-summarize")
        await session.commit()
        own_key_events = await session.scalars(
            select(AiUsageEvent).where(AiUsageEvent.used_own_key.is_(True))
        )
        assert len(list(own_key_events)) == 5


async def test_contact_form_spam_protection(
    client: CsrfClient, container: Container, outbox, monkeypatch
) -> None:
    import app.api.routes.contact as contact

    token = (await client.get("/api/v1/contact/token")).json()["token"]
    message = {
        "name": "Imran",
        "email": "imran@example.com",
        "topic": "bug",
        "message": "The merge button froze.",
        "token": token,
    }
    instant = await client.post("/api/v1/contact", json=message)
    assert instant.status_code == 202
    honeypot = await client.post("/api/v1/contact", json={**message, "website": "http://spam.example"})
    assert honeypot.status_code == 202
    async with container.database.session() as session:
        assert list(await session.scalars(select(ContactMessage))) == []

    real_time = contact.time.time
    monkeypatch.setattr(contact.time, "time", lambda: real_time() + 10)
    accepted = await client.post("/api/v1/contact", json=message)
    assert accepted.status_code == 202
    async with container.database.session() as session:
        stored = list(await session.scalars(select(ContactMessage)))
        assert len(stored) == 1 and stored[0].topic == "bug"
    assert outbox[-1].subject.endswith("bug: Imran") and "merge button" in outbox[-1].text

    forged = await client.post("/api/v1/contact", json={**message, "token": "123.forged-signature"})
    assert forged.status_code == 400
    monkeypatch.setattr(contact.time, "time", lambda: real_time() + 60 * 60 * 7)
    expired = await client.post("/api/v1/contact", json=message)
    assert expired.status_code == 400
    monkeypatch.undo()
    statuses = [(await client.post("/api/v1/contact", json=message)).status_code for _ in range(6)]
    assert statuses[-1] == 429
