"""RBAC: editor can't manage users, support can't touch settings, etc."""

from tests.conftest import EDITOR_USER, SUPPORT_USER, login_as


async def test_editor_cannot_manage_users(client):
    await login_as(client, EDITOR_USER)
    resp = await client.get("/api/v1/admin/users")
    assert resp.status_code == 403


async def test_editor_can_update_settings(client):
    await login_as(client, EDITOR_USER)
    resp = await client.put(
        "/api/v1/admin/settings/contact",
        json={"value": {"phones": ["09120000000"], "email": "x@y.z"}},
    )
    assert resp.status_code == 200
    assert resp.json()["value"]["phones"] == ["09120000000"]


async def test_support_cannot_update_settings(client):
    await login_as(client, SUPPORT_USER)
    resp = await client.put(
        "/api/v1/admin/settings/contact",
        json={"value": {"phones": ["1"]}},
    )
    assert resp.status_code == 403


async def test_support_can_list_consultations(client):
    await login_as(client, SUPPORT_USER)
    resp = await client.get("/api/v1/admin/consultations")
    assert resp.status_code == 200


async def test_support_cannot_manage_lawyers(client):
    await login_as(client, SUPPORT_USER)
    resp = await client.post(
        "/api/v1/admin/lawyers",
        json={"slug": "new-guy", "name": "وکیل تست"},
    )
    assert resp.status_code == 403


async def test_csrf_cross_origin_rejected(admin_client):
    resp = await admin_client.put(
        "/api/v1/admin/settings/contact",
        json={"value": {}},
        headers={"Origin": "https://evil.example"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "csrf"
