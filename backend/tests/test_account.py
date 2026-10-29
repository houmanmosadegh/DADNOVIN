"""Account/referral/commission system tests — auth, IDOR, anti-fraud, wallet."""

import pytest
from sqlalchemy import select

from main.models.account import Commission, CommissionRule
from main.models.consultation import ConsultationRequest
from main.models.content import SiteSetting

from .conftest import ADMIN_PASS, ADMIN_USER, login_as

pytestmark = pytest.mark.asyncio

PHONE_A = "09121110001"
PHONE_B = "09121110002"
PHONE_M = "09121110003"
USER_PASS = "Passw0rd!23"


async def _register(client, phone, name="کاربر تست", password=USER_PASS, ref=""):
    return await client.post(
        "/api/v1/account-auth/register",
        json={"full_name": name, "phone": phone, "password": password, "ref_code": ref},
    )


async def _login_user(client, phone, password=USER_PASS):
    r = await client.post(
        "/api/v1/account-auth/login",
        json={"identifier": phone, "password": password},
    )
    assert r.status_code == 200, r.text


async def _admin(client):
    await login_as(client, ADMIN_USER)


async def _consult(client, phone, name="مراجع تست", ref=""):
    return await client.post(
        "/api/v1/consultations",
        json={
            "full_name": name, "phone": phone, "topic": "ملکی",
            "message": "توضیح تست", "source_page": "/", "ref_code": ref,
        },
    )


async def _set_status(client, request_id, status, fee=None):
    body = {"status": status}
    if fee is not None:
        body["fee_amount"] = fee
    return await client.post(
        f"/api/v1/admin/requests/consultation/{request_id}/status", json=body
    )


async def _consult_row(seeded_session, client, phone, name="مراجع تست", ref=""):
    r = await _consult(client, phone, name, ref)
    assert r.status_code == 201, r.text
    return (
        await seeded_session.execute(
            select(ConsultationRequest).where(
                ConsultationRequest.tracking_code == r.json()["tracking_code"]
            )
        )
    ).scalar_one()


async def _make_marketer(client, phone):
    """Register → apply → admin approve → re-login user → ref_code.

    The shared httpx client holds one cookie jar — re-login swaps roles.
    """
    r = await _register(client, phone, "بازاریاب تست")
    assert r.status_code == 201, r.text
    r = await client.post("/api/v1/account/marketer/apply", json={"note": ""})
    assert r.status_code == 201, r.text
    app_id = r.json()["id"]
    await _admin(client)
    r = await client.post(f"/api/v1/admin/marketers/applications/{app_id}/approve")
    assert r.status_code == 200, r.text
    code = r.json()["ref_code"]
    await _login_user(client, phone)
    return code


class TestRegisterLogin:
    async def test_register_login_me(self, client):
        r = await _register(client, PHONE_A)
        assert r.status_code == 201, r.text
        me = r.json()
        assert me["phone"] == PHONE_A
        assert "user" in me["roles"]

        await _login_user(client, PHONE_A)
        r = await client.get("/api/v1/account/me")
        assert r.json()["full_name"] == "کاربر تست"

    async def test_duplicate_phone_rejected(self, client):
        assert (await _register(client, PHONE_A)).status_code == 201
        r = await _register(client, PHONE_A)
        assert r.status_code == 409

    async def test_bad_password(self, client):
        await _register(client, PHONE_A)
        r = await client.post(
            "/api/v1/account-auth/login",
            json={"identifier": PHONE_A, "password": "wrong-password"},
        )
        assert r.status_code == 401

    async def test_staff_login_by_username(self, client):
        """Unified endpoint also accepts a staff username."""
        r = await client.post(
            "/api/v1/account-auth/login",
            json={"identifier": ADMIN_USER, "password": ADMIN_PASS},
        )
        assert r.status_code == 200, r.text
        me = r.json()
        assert any(r_ in ("super_admin", "admin") for r_ in me["roles"])

    async def test_forgot_never_leaks(self, client):
        r = await client.post(
            "/api/v1/account-auth/forgot", json={"phone": "09129999999"}
        )
        assert r.status_code == 200
        msg = r.json()["message"]
        r = await client.post("/api/v1/account-auth/forgot", json={"phone": PHONE_A})
        assert r.status_code == 200
        assert r.json()["message"] == msg

    async def test_user_cannot_access_admin(self, client):
        await _register(client, PHONE_A)
        r = await client.get("/api/v1/admin/users")
        assert r.status_code == 403


class TestMyRequests:
    async def test_guest_requests_claimed_on_register(self, client):
        r = await _consult(client, PHONE_B)
        assert r.status_code == 201
        code = r.json()["tracking_code"]

        await _register(client, PHONE_B)
        r = await client.get("/api/v1/account/requests")
        assert r.status_code == 200
        assert any(row["tracking_code"] == code for row in r.json())

    async def test_idor_other_users_request(self, client, seeded_session):
        row = await _consult_row(seeded_session, client, PHONE_B)
        await _register(client, PHONE_A)  # different user
        r = await client.get(f"/api/v1/account/requests/{row.id}")
        assert r.status_code == 404

    async def test_unauthenticated_blocked(self, client):
        r = await client.get("/api/v1/account/requests")
        assert r.status_code == 401


class TestReferral:
    async def test_apply_approve_ref_code(self, client):
        code = await _make_marketer(client, PHONE_M)
        assert code.startswith("DN-")
        r = await client.get("/api/v1/account/marketer")
        assert r.status_code == 200
        assert r.json()["ref_code"] == code
        assert r.json()["is_active"] is True

    async def test_attribution_on_submit(self, client, seeded_session):
        code = await _make_marketer(client, PHONE_M)
        row = await _consult_row(seeded_session, client, PHONE_B, ref=code)
        assert row.ref_code == code
        assert row.referrer_id is not None

    async def test_self_referral_blocked(self, client, seeded_session):
        code = await _make_marketer(client, PHONE_M)
        row = await _consult_row(seeded_session, client, PHONE_M, ref=code)
        assert row.referrer_id is None

    async def test_existing_client_not_attributed(self, client, seeded_session):
        code = await _make_marketer(client, PHONE_M)
        await _consult_row(seeded_session, client, PHONE_B)  # no longer "new"
        row = await _consult_row(seeded_session, client, PHONE_B, ref=code)
        assert row.referrer_id is None

    async def test_bad_code_ignored(self, client, seeded_session):
        row = await _consult_row(seeded_session, client, PHONE_B, ref="DN-XXXXXX")
        assert row.referrer_id is None


class TestCommissionWallet:
    async def _enable(self, seeded_session):
        row = await seeded_session.get(SiteSetting, "commission")
        row.value = {**row.value, "commission_enabled": True, "hold_days": 0, "min_payout": 0}
        seeded_session.add(CommissionRule(kind="fixed", value=500_000, tier_min=0))
        await seeded_session.commit()

    async def test_commission_on_accept_and_payout(self, client, seeded_session):
        await self._enable(seeded_session)
        code = await _make_marketer(client, PHONE_M)
        row = await _consult_row(seeded_session, client, PHONE_B, ref=code)

        await _admin(client)
        await _set_status(client, row.id, "reviewing")
        await _set_status(client, row.id, "consulted")
        r = await _set_status(client, row.id, "accepted", fee=10_000_000)
        assert r.status_code == 200

        comm = (await seeded_session.execute(select(Commission))).scalar_one()
        assert comm.amount == 500_000 and comm.status == "pending"

        r = await client.post(f"/api/v1/admin/commissions/{comm.id}/approve")
        assert r.status_code == 200

        await _login_user(client, PHONE_M)
        r = await client.get("/api/v1/account/wallet")
        assert r.status_code == 200
        assert r.json()["balance"] == 500_000

        r = await client.post("/api/v1/account/payouts", json={"amount": 500_000})
        assert r.status_code == 201, r.text
        payout_id = r.json()["id"]

        await _admin(client)
        r = await client.post(
            f"/api/v1/admin/payouts/{payout_id}/approve",
            json={"payment_ref": "TRX-123"},
        )
        assert r.status_code == 200
        await _login_user(client, PHONE_M)
        r = await client.get("/api/v1/account/wallet")
        assert r.json()["balance"] == 0

    async def test_no_commission_when_disabled(self, client, seeded_session):
        # commission_enabled stays False (default) — spec compliance switch
        code = await _make_marketer(client, PHONE_M)
        row = await _consult_row(seeded_session, client, PHONE_B, ref=code)
        await _admin(client)
        await _set_status(client, row.id, "reviewing")
        await _set_status(client, row.id, "consulted")
        await _set_status(client, row.id, "accepted")
        assert (
            await seeded_session.execute(select(Commission))
        ).scalar_one_or_none() is None

    async def test_payout_insufficient_rejected(self, client, seeded_session):
        await self._enable(seeded_session)
        await _make_marketer(client, PHONE_M)
        r = await client.post("/api/v1/account/payouts", json={"amount": 10})
        assert r.status_code == 400

    async def test_marketer_privacy_mask(self, client, seeded_session):
        """Marketer sees masked name + coarse status — never case details."""
        code = await _make_marketer(client, PHONE_M)
        await _consult_row(seeded_session, client, PHONE_B, name="علی رضایی", ref=code)
        r = await client.get("/api/v1/account/marketer/referrals")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 1
        assert "علی" not in str(rows)
        assert "رضایی" not in str(rows)
        assert "topic" not in rows[0] and "message" not in rows[0]
        assert rows[0]["masked_name"].startswith("ع.")
