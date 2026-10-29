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


async def _register(
    client, phone, name="کاربر تست", password=USER_PASS, ref="", username=None, otp=""
):
    return await client.post(
        "/api/v1/account-auth/register",
        json={
            "full_name": name,
            "username": username or f"user_{phone[-6:]}",
            "phone": phone,
            "password": password,
            "ref_code": ref,
            "otp": otp,
        },
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
    r = await client.post("/api/v1/account/marketer/apply", json={"note": "", "channel": "", "terms": True})
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


class TestUsernameOtp:
    async def test_check_username_live(self, client):
        r = await client.get("/api/v1/account-auth/check-username?u=karimi_92")
        assert r.json() == {"available": True, "reason": ""}
        await _register(client, PHONE_A, username="karimi_92")
        r = await client.get("/api/v1/account-auth/check-username?u=karimi_92")
        assert r.json()["available"] is False
        r = await client.get("/api/v1/account-auth/check-username?u=نام!خراب")
        assert r.json()["reason"] == "format"

    async def test_register_requires_username(self, client):
        r = await client.post(
            "/api/v1/account-auth/register",
            json={"full_name": "تست تستی", "phone": PHONE_A, "password": USER_PASS},
        )
        assert r.status_code == 422  # missing username

    async def test_duplicate_username_rejected(self, client):
        await _register(client, PHONE_A, username="ali_law")
        r = await _register(client, PHONE_B, username="ali_law")
        assert r.status_code == 409

    async def test_login_with_username(self, client):
        await _register(client, PHONE_A, username="user_a1")
        r = await client.post(
            "/api/v1/account-auth/login",
            json={"identifier": "user_a1", "password": USER_PASS},
        )
        assert r.status_code == 200

    async def test_otp_flow_when_enabled(self, client, seeded_session):
        row = await seeded_session.get(SiteSetting, "auth")
        if row is None:
            seeded_session.add(SiteSetting(key="auth", value={}, is_public=False))
            await seeded_session.flush()
            row = await seeded_session.get(SiteSetting, "auth")
        row.value = {**(row.value or {}), "otp_enabled": True}
        await seeded_session.commit()

        r = await client.get("/api/v1/account-auth/config")
        assert r.json()["otp_enabled"] is True

        # register without otp → required error
        r = await _register(client, PHONE_A)
        assert r.status_code == 422
        assert r.json()["detail"]["code"] == "otp_required"

        # request a code → token lands in db; mock provider just logs
        r = await client.post(
            "/api/v1/account-auth/otp/request", json={"phone": PHONE_A}
        )
        assert r.status_code == 200
        from sqlalchemy import select as sel

        from main.models.account import OtpToken

        tok = (
            await seeded_session.execute(
                sel(OtpToken).where(OtpToken.phone == PHONE_A)
            )
        ).scalar_one()
        # can't know the raw code — simulate verify attempts then expiry path
        tok.code_hash = "0" * 64  # impossible hash
        await seeded_session.commit()
        r = await _register(client, PHONE_A, username="otp_user", otp="000000")
        assert r.status_code == 400  # bad_otp

    async def test_otp_disabled_by_default(self, client):
        r = await client.get("/api/v1/account-auth/config")
        assert r.json()["otp_enabled"] is False
        r = await client.post(
            "/api/v1/account-auth/otp/request", json={"phone": PHONE_A}
        )
        assert r.status_code == 400


class TestReferralLinks:
    async def test_redirect_records_click_and_cookie(self, client):
        code = await _make_marketer(client, PHONE_M)
        r = await client.get(
            f"/api/v1/referrals/r/{code}?src=instagram", follow_redirects=False
        )
        assert r.status_code == 302
        assert r.headers["location"] == "/"
        assert "dn_ref" in r.headers["set-cookie"]

    async def test_bad_code_still_redirects(self, client):
        r = await client.get("/api/v1/referrals/r/DN-NOPE", follow_redirects=False)
        assert r.status_code == 302

    async def test_labeled_links_crud_and_stats(self, client):
        code = await _make_marketer(client, PHONE_M)
        r = await client.post(
            "/api/v1/account/marketer/links", json={"label": "instagram"}
        )
        assert r.status_code == 201, r.text
        assert r.json()["url"] == f"/r/{code}?src=instagram"

        # click through the labeled link then check per-link stats
        await client.get(f"/api/v1/referrals/r/{code}?src=instagram")
        r = await client.get("/api/v1/account/marketer/links")
        rows = r.json()
        assert len(rows) == 1 and rows[0]["label"] == "instagram"
        assert rows[0]["clicks"] == 1 and rows[0]["unique_clicks"] == 1

        link_id = rows[0]["id"]
        r = await client.delete(f"/api/v1/account/marketer/links/{link_id}")
        assert r.status_code == 204
        r = await client.get("/api/v1/account/marketer/links")
        assert r.json() == []

    async def test_qr_svg(self, client):
        await _make_marketer(client, PHONE_M)
        r = await client.get("/api/v1/account/marketer/qr?src=telegram")
        assert r.status_code == 200
        assert r.text.startswith("<svg") or "<svg" in r.text[:200]

    async def test_links_forbidden_for_non_marketer(self, client):
        await _register(client, PHONE_A)
        r = await client.get("/api/v1/account/marketer/links")
        assert r.status_code == 403


class TestAdminMarketing:
    async def test_preview_calculator(self, client, seeded_session):
        seeded_session.add(
            CommissionRule(kind="percent", value=10, max_amount=1_000_000)
        )
        await seeded_session.commit()
        await _admin(client)
        r = await client.post(
            "/api/v1/admin/commissions/preview",
            json={"basis_amount": 5_000_000},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["matched"] is True
        assert body["amount"] == 500_000  # 10% of 5M
        r = await client.post(
            "/api/v1/admin/commissions/preview",
            json={"basis_amount": 50_000_000},
        )
        assert r.json()["amount"] == 1_000_000  # clamped by max_amount

    async def test_rule_validity_window_and_clamps(self, client, seeded_session):
        await _admin(client)
        r = await client.post(
            "/api/v1/admin/commissions/rules",
            json={
                "kind": "fixed", "value": 100_000, "min_amount": 200_000,
                "ends_at": "2000-01-01T00:00:00Z",
            },
        )
        assert r.status_code == 201, r.text
        r = await client.get("/api/v1/admin/commissions/rules")
        rule = r.json()[0]
        assert rule["min_amount"] == 200_000 and rule["ends_at"] is not None

    async def test_report_and_csv(self, client, seeded_session):
        await _make_marketer(client, PHONE_M)
        await _admin(client)
        r = await client.get("/api/v1/admin/marketers/report")
        assert r.status_code == 200
        body = r.json()
        assert len(body["leaderboard"]) == 1
        assert "funnel" in body and "suspicious" in body
        r = await client.get("/api/v1/admin/marketers/report.csv")
        assert r.status_code == 200
        assert "ref_code" in r.text and "DN-" in r.text

    async def test_suspicious_click_flood_flagged(self, client, seeded_session):
        code = await _make_marketer(client, PHONE_M)
        for _ in range(21):
            await client.get(f"/api/v1/referrals/r/{code}")
        await _admin(client)
        r = await client.get("/api/v1/admin/marketers/report")
        suspicious = r.json()["suspicious"]
        assert len(suspicious) >= 1
        assert suspicious[0]["reason"] == "click_flood"
