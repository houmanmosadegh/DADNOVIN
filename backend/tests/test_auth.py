"""Auth flow: login/logout/me, generic errors, session guard."""

from tests.conftest import ADMIN_USER, ADMIN_PASS, EDITOR_USER, login_as


async def test_login_success_sets_cookie_and_me(client):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == ADMIN_USER
    assert "super_admin" in [r["name"] for r in body["roles"]]
    assert "dadnovin_session" in resp.cookies

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == ADMIN_USER


async def test_login_wrong_password_generic_error(client):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": ADMIN_USER, "password": "wrong-password"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "bad_credentials"


async def test_login_unknown_user_same_error(client):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "ghost-user", "password": "whatever-pass1"},
    )
    assert resp.status_code == 401
    # identical shape — no account enumeration
    assert resp.json()["detail"]["code"] == "bad_credentials"


async def test_admin_endpoint_requires_session(client):
    resp = await client.get("/api/v1/admin/dashboard/overview")
    assert resp.status_code == 401


async def test_logout_revokes_session(client):
    await login_as(client, EDITOR_USER)
    resp = await client.post("/api/v1/auth/logout")
    assert resp.status_code == 200
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 401


async def test_dashboard_real_counts(admin_client):
    resp = await admin_client.get("/api/v1/admin/dashboard/overview")
    assert resp.status_code == 200
    stats = resp.json()["stats"]
    assert stats["lawyers_visible"] == 2
    assert stats["users_active"] == 3
