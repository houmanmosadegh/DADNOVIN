"""Account/referral/commission system tests — auth, IDOR, anti-fraud, commissions."""

import pytest
from sqlalchemy import select

from main.models.account import CaseFeeReceipt, Commission
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


async def _consult(client, phone, name="مراجع تست", ref="", consent=True):
    return await client.post(
        "/api/v1/consultations",
        json={
            "full_name": name,
            "phone": phone,
            "topic": "ملکی",
            "message": "توضیح تست",
            "source_page": "/",
            "ref_code": ref,
            "ref_consent": consent,
        },
    )


async def _set_status(client, request_id, status, fee=None):
    body = {"status": status}
    if fee is not None:
        body["fee_amount"] = fee
    return await client.post(
        f"/api/v1/admin/requests/consultation/{request_id}/status", json=body
    )


async def _consult_row(
    seeded_session, client, phone, name="مراجع تست", ref="", consent=True
):
    r = await _consult(client, phone, name, ref, consent)
    assert r.status_code == 201, r.text
    return (
        await seeded_session.execute(
            select(ConsultationRequest).where(
                ConsultationRequest.tracking_code == r.json()["tracking_code"]
            )
        )
    ).scalar_one()


async def _enable_marketing(seeded_session):
    srow = await seeded_session.get(SiteSetting, "commission")
    srow.value = {**(srow.value or {}), "marketing_enabled": True}
    await seeded_session.commit()


async def _make_marketer(client, seeded_session, phone):
    """Register → apply → admin approve → re-login user → ref_code.

    Enables the marketing switch first — it's off by default in seed data.
    The shared httpx client holds one cookie jar — re-login swaps roles.
    """
    await _enable_marketing(seeded_session)
    r = await _register(client, phone, "بازاریاب تست")
    assert r.status_code == 201, r.text
    r = await client.post(
        "/api/v1/account/marketer/apply",
        json={"note": "", "channel": "", "terms": True},
    )
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
    async def test_apply_approve_ref_code(self, client, seeded_session):
        code = await _make_marketer(client, seeded_session, PHONE_M)
        assert code.startswith("DN-")
        r = await client.get("/api/v1/account/marketer")
        assert r.status_code == 200
        assert r.json()["ref_code"] == code
        assert r.json()["is_active"] is True

    async def test_attribution_on_submit(self, client, seeded_session):
        code = await _make_marketer(client, seeded_session, PHONE_M)
        row = await _consult_row(seeded_session, client, PHONE_B, ref=code)
        assert row.ref_code == code
        assert row.referrer_id is not None

    async def test_self_referral_blocked(self, client, seeded_session):
        code = await _make_marketer(client, seeded_session, PHONE_M)
        row = await _consult_row(seeded_session, client, PHONE_M, ref=code)
        assert row.referrer_id is None

    async def test_existing_client_not_attributed(self, client, seeded_session):
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _consult_row(seeded_session, client, PHONE_B)  # no longer "new"
        row = await _consult_row(seeded_session, client, PHONE_B, ref=code)
        assert row.referrer_id is None

    async def test_bad_code_ignored(self, client, seeded_session):
        row = await _consult_row(seeded_session, client, PHONE_B, ref="DN-XXXXXX")
        assert row.referrer_id is None


class TestCommissionLifecycle:
    """Receipt-driven commission ledger — pending → approved → paid | reversal."""

    async def _enable(self, seeded_session, *, rate=15):
        row = await seeded_session.get(SiteSetting, "commission")
        row.value = {
            **(row.value or {}),
            "marketing_enabled": True,
            "default_rate": rate,
        }
        await seeded_session.commit()

    async def _referred_case(self, client, seeded_session, ref_code, phone=PHONE_B):
        row = await _consult_row(seeded_session, client, phone, ref=ref_code)
        await _set_status(client, row.id, "reviewing")
        await _set_status(client, row.id, "consulted")
        r = await _set_status(client, row.id, "accepted")
        assert r.status_code == 200, r.text
        return row

    async def _receipt(self, client, request_id, amount, note=""):
        return await client.post(
            f"/api/v1/admin/requests/consultation/{request_id}/fee-receipts",
            json={"amount": amount, "note": note},
        )

    async def test_accrual_15pct_of_40m(self, client, seeded_session):
        """۴۰٬۰۰۰٬۰۰۰ × ۱۵٪ = ۶٬۰۰۰٬۰۰۰ — the spec's canonical example."""
        await self._enable(seeded_session, rate=15)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await self._referred_case(client, seeded_session, code)
        r = await self._receipt(client, row.id, 40_000_000)
        assert r.status_code == 201, r.text
        assert r.json()["commission_amount"] == 6_000_000
        comm = (await seeded_session.execute(select(Commission))).scalar_one()
        assert comm.entry_type == "accrual"
        assert comm.basis_amount == 40_000_000
        assert comm.rate_bp == 1500
        assert comm.amount == 6_000_000
        assert comm.status == "pending"

    async def test_installments_one_entry_each(self, client, seeded_session):
        """هر قسط حق‌الوکاله یک ورودی accrual جدا."""
        await self._enable(seeded_session, rate=10)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await self._referred_case(client, seeded_session, code)
        r1 = await self._receipt(client, row.id, 20_000_000, "قسط اول")
        r2 = await self._receipt(client, row.id, 30_000_000, "قسط دوم")
        assert r1.json()["commission_amount"] == 2_000_000
        assert r2.json()["commission_amount"] == 3_000_000
        comms = (
            (
                await seeded_session.execute(
                    select(Commission).where(Commission.entry_type == "accrual")
                )
            )
            .scalars()
            .all()
        )
        assert len(comms) == 2
        assert sum(c.amount for c in comms) == 5_000_000

    async def test_rate_snapshot_immutable(self, client, seeded_session):
        """تغییر نرخ بعد از ثبت، کمیسیون‌های قبلی را عوض نمی‌کند."""
        await self._enable(seeded_session, rate=15)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await self._referred_case(client, seeded_session, code)
        await self._receipt(client, row.id, 10_000_000)
        comm = (await seeded_session.execute(select(Commission))).scalar_one()
        assert comm.amount == 1_500_000 and comm.rate_bp == 1500

        row = await seeded_session.get(SiteSetting, "commission")
        row.value = {**row.value, "default_rate": 25}
        await seeded_session.commit()
        await seeded_session.refresh(comm)
        assert comm.amount == 1_500_000 and comm.rate_bp == 1500

    async def test_custom_rate_overrides_default(self, client, seeded_session):
        await self._enable(seeded_session, rate=15)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        from main.models.account import MarketerProfile

        prof = (await seeded_session.execute(select(MarketerProfile))).scalar_one()
        prof.custom_rate = 20
        await seeded_session.commit()
        row = await self._referred_case(client, seeded_session, code)
        await self._receipt(client, row.id, 10_000_000)
        comm = (await seeded_session.execute(select(Commission))).scalar_one()
        assert comm.rate_bp == 2000 and comm.amount == 2_000_000

    async def test_reversal_on_cancel(self, client, seeded_session):
        """برگشت پرونده → ورودی reversal منفی، نه حذف رکورد."""
        await self._enable(seeded_session, rate=10)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await self._referred_case(client, seeded_session, code)
        await self._receipt(client, row.id, 10_000_000)
        accrual = (await seeded_session.execute(select(Commission))).scalar_one()

        r = await client.post(
            f"/api/v1/admin/requests/consultation/{row.id}/status",
            json={"status": "cancelled", "reason": "عودت وجه به موکل"},
        )
        assert r.status_code == 200, r.text
        await seeded_session.refresh(accrual)
        assert accrual.status == "cancelled"
        rev = (
            await seeded_session.execute(
                select(Commission).where(Commission.entry_type == "reversal")
            )
        ).scalar_one()
        assert rev.amount == -accrual.amount
        assert rev.parent_id == accrual.id

    async def test_manual_reverse_endpoint(self, client, seeded_session):
        await self._enable(seeded_session, rate=10)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await self._referred_case(client, seeded_session, code)
        await self._receipt(client, row.id, 10_000_000)
        comm = (await seeded_session.execute(select(Commission))).scalar_one()
        r = await client.post(
            f"/api/v1/admin/commissions/{comm.id}/reverse",
            json={"amount": 500_000, "note": "برگشت جزئی"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == -500_000
        # full second reversal then hits the already_reversed guard eventually
        r = await client.post(f"/api/v1/admin/commissions/{comm.id}/reverse", json={})
        assert r.status_code == 200
        r = await client.post(f"/api/v1/admin/commissions/{comm.id}/reverse", json={})
        assert r.status_code == 409

    async def test_idempotent_accrual(self, client, seeded_session):
        from main.services import commissions as comm_svc

        await self._enable(seeded_session, rate=10)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await self._referred_case(client, seeded_session, code)
        await self._receipt(client, row.id, 10_000_000)
        receipt = (await seeded_session.execute(select(CaseFeeReceipt))).scalar_one()
        again = await comm_svc.accrue_for_receipt(seeded_session, receipt, None)
        assert again is None
        assert (
            len((await seeded_session.execute(select(Commission))).scalars().all()) == 1
        )

    async def test_pay_flow_and_marketer_view(self, client, seeded_session):
        await self._enable(seeded_session, rate=10)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await self._referred_case(client, seeded_session, code)
        await self._receipt(client, row.id, 10_000_000)
        comm = (await seeded_session.execute(select(Commission))).scalar_one()

        r = await client.post(
            f"/api/v1/admin/commissions/{comm.id}/pay", json={"note": ""}
        )
        assert r.status_code == 409  # must be approved first
        r = await client.post(f"/api/v1/admin/commissions/{comm.id}/approve")
        assert r.status_code == 200
        r = await client.post(
            f"/api/v1/admin/commissions/{comm.id}/pay",
            json={"note": "فیش 123456"},
        )
        assert r.status_code == 200

        # marketer sees the SAME amounts as admin — whitelist fields only
        await _login_user(client, PHONE_M)
        r = await client.get("/api/v1/account/commissions")
        assert r.status_code == 200
        data = r.json()
        assert data["totals"]["paid"] == 1_000_000
        item = data["items"][0]
        assert item["amount"] == comm.amount
        assert item["fee_amount"] == comm.basis_amount
        assert item["rate"] == 10
        # legal confidentiality — none of these may ever appear
        body = str(data)
        for forbidden in ("tracking_code", "topic", "phone", "message", "request_id"):
            assert forbidden not in body, forbidden

    async def test_commissions_idor(self, client, seeded_session):
        await self._enable(seeded_session)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await self._referred_case(client, seeded_session, code)
        await self._receipt(client, row.id, 10_000_000)
        await _make_marketer(client, seeded_session, "09121110004")
        r = await client.get("/api/v1/account/commissions")
        assert r.status_code == 200
        assert r.json()["items"] == []
        assert r.json()["totals"]["pending"] == 0

    async def test_marketing_off_gates_everything(self, client, seeded_session):
        """سوئیچ خاموش → apply/commissions/link ۴۰۴، روت /r/ ۴۰۴، بدون accrual."""
        await self._enable(seeded_session)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        # flip the switch OFF
        row = await seeded_session.get(SiteSetting, "commission")
        row.value = {**row.value, "marketing_enabled": False}
        await seeded_session.commit()

        r = await client.get(f"/api/v1/referrals/r/{code}")
        assert r.status_code == 404
        r = await client.get("/api/v1/account/commissions")
        assert r.status_code == 404
        r = await client.get("/api/v1/account/marketer")
        assert r.status_code == 404
        await _register(client, PHONE_B)
        r = await client.post("/api/v1/account/marketer/apply", json={"terms": True})
        assert r.status_code == 404
        await _admin(client)
        r = await client.get("/api/v1/admin/commissions")
        assert r.status_code == 404

    async def test_flagged_referral_accrues_nothing(self, client, seeded_session):
        from main.models.account import ReferralAttribution

        await self._enable(seeded_session, rate=10)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await self._referred_case(client, seeded_session, code)
        attr = (await seeded_session.execute(select(ReferralAttribution))).scalar_one()
        attr.flag = "review"
        await seeded_session.commit()
        r = await self._receipt(client, row.id, 10_000_000)
        assert r.status_code == 201
        assert r.json()["commission_id"] is None
        assert (
            await seeded_session.execute(select(Commission))
        ).scalar_one_or_none() is None

    async def test_no_accrual_without_receipt(self, client, seeded_session):
        """قبولی پرونده به‌خوده‌خود کمیسیون نمی‌سازد — فقط رسید دریافتی."""
        await self._enable(seeded_session, rate=15)
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        await self._referred_case(client, seeded_session, code)
        assert (
            await seeded_session.execute(select(Commission))
        ).scalar_one_or_none() is None

    async def test_marketer_privacy_mask(self, client, seeded_session):
        """بدون رضایت: نام مخفی؛ با رضایت: نام کامل — هرگز جزئیات پرونده."""
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _consult_row(
            seeded_session, client, PHONE_B, name="علی رضایی", ref=code, consent=True
        )
        await _consult_row(
            seeded_session,
            client,
            "09121110009",
            name="مریم کریمی",
            ref=code,
            consent=False,
        )
        r = await client.get("/api/v1/account/marketer/referrals")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 2
        consented = next(x for x in rows if x["consent"])
        refused = next(x for x in rows if not x["consent"])
        assert consented["full_name"] == "علی رضایی"
        assert consented["name"] == "علی رضایی"
        assert refused["full_name"] is None
        assert refused["name"] == "مراجعه‌کننده"  # not even initials leak
        body = str(rows)
        for forbidden in ("topic", "message", "phone", "tracking_code"):
            assert forbidden not in body, forbidden


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
            await seeded_session.execute(sel(OtpToken).where(OtpToken.phone == PHONE_A))
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
    async def test_redirect_records_click_and_cookie(self, client, seeded_session):
        code = await _make_marketer(client, seeded_session, PHONE_M)
        r = await client.get(
            f"/api/v1/referrals/r/{code}?src=instagram", follow_redirects=False
        )
        assert r.status_code == 302
        # redirect carries ?refui= so the SPA can prefill without a 2nd click
        assert r.headers["location"] == f"/?refui={code}"
        assert "dn_ref" in r.headers["set-cookie"]

    async def test_bad_code_still_redirects(self, client, seeded_session):
        srow = await seeded_session.get(SiteSetting, "commission")
        srow.value = {**(srow.value or {}), "marketing_enabled": True}
        await seeded_session.commit()
        r = await client.get("/api/v1/referrals/r/DN-NOPE", follow_redirects=False)
        assert r.status_code == 302

    async def test_channel_links_and_stats(self, client, seeded_session):
        code = await _make_marketer(client, seeded_session, PHONE_M)
        r = await client.post(
            "/api/v1/account/marketer/links", json={"channel": "instagram"}
        )
        assert r.status_code == 201, r.text
        assert r.json()["url"] == f"/r/{code}?s=instagram"

        # click through the channel link then check per-channel stats
        await client.get(f"/api/v1/referrals/r/{code}?s=instagram")
        r = await client.get("/api/v1/account/marketer/links")
        rows = r.json()
        assert len(rows) == 1 and rows[0]["channel"] == "instagram"
        assert rows[0]["clicks"] == 1 and rows[0]["unique_clicks"] == 1

        # stats roll up by channel on the profile payload
        r = await client.get("/api/v1/account/marketer")
        ch = {c["channel"]: c for c in r.json()["stats"]["channels"]}
        assert ch["instagram"]["clicks"] == 1

        r = await client.delete("/api/v1/account/marketer/links/instagram")
        assert r.status_code == 204
        r = await client.get("/api/v1/account/marketer/links")
        assert r.json() == []

        # non-whitelisted channel rejected
        r = await client.post(
            "/api/v1/account/marketer/links", json={"channel": "darkweb"}
        )
        assert r.status_code == 400

    async def test_qr_png_decodes(self, client, seeded_session):
        """QR must decode to the exact referral URL — real decoder, not vibes."""
        code = await _make_marketer(client, seeded_session, PHONE_M)
        r = await client.get("/api/v1/account/marketer/qr.png")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
        import io

        import zxingcpp
        from PIL import Image

        img = Image.open(io.BytesIO(r.content))
        decoded = zxingcpp.read_barcodes(img)
        assert decoded, "QR did not decode"
        assert decoded[0].text == f"http://localhost:8080/r/{code}"

    async def test_card_png_and_pdf(self, client, seeded_session):
        await _make_marketer(client, seeded_session, PHONE_M)
        r = await client.get("/api/v1/account/marketer/card.png")
        assert r.status_code == 200 and r.content[:8] == b"\x89PNG\r\n\x1a\n"
        import io

        from PIL import Image

        img = Image.open(io.BytesIO(r.content))
        assert img.width == 2362 and img.height == 1476  # ~300dpi card
        r = await client.get("/api/v1/account/marketer/card.pdf")
        assert r.status_code == 200 and r.content[:5] == b"%PDF-"

    async def test_links_forbidden_for_non_marketer(self, client, seeded_session):
        srow = await seeded_session.get(SiteSetting, "commission")
        srow.value = {**(srow.value or {}), "marketing_enabled": True}
        await seeded_session.commit()
        await _register(client, PHONE_A)
        r = await client.get("/api/v1/account/marketer/links")
        assert r.status_code == 403


class TestAdminMarketing:
    async def test_percentage_only_config(self, client, seeded_session):
        """تب قواعد فقط درصد است — بدون rules engine، بدون ماشین‌حساب."""
        await _enable_marketing(seeded_session)
        await _admin(client)
        r = await client.get("/api/v1/admin/commissions/config")
        assert r.status_code == 200
        assert r.json()["default_rate"] == 15
        r = await client.patch(
            "/api/v1/admin/commissions/config", json={"default_rate": 20}
        )
        assert r.status_code == 200
        assert r.json()["default_rate"] == 20
        # audit history captures the change
        r = await client.get("/api/v1/admin/commissions/rate-history")
        assert r.json()[0]["to"] == 20
        # dead endpoints are gone
        r = await client.get("/api/v1/admin/commissions/rules")
        assert r.status_code == 404
        r = await client.post(
            "/api/v1/admin/commissions/preview", json={"basis_amount": 1}
        )
        assert r.status_code == 404

    async def test_status_enum_guarded(self, client, seeded_session):
        await _enable_marketing(seeded_session)
        await _admin(client)
        r = await client.get("/api/v1/admin/commissions/summary")
        assert r.status_code == 200
        assert set(r.json()["office"]) == {"pending", "approved", "paid", "cancelled"}
        r = await client.patch(
            "/api/v1/admin/commissions/config", json={"default_rate": 101}
        )
        assert r.status_code == 422  # 0..100 validation

    async def test_report_and_csv(self, client, seeded_session):
        await _make_marketer(client, seeded_session, PHONE_M)
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
        code = await _make_marketer(client, seeded_session, PHONE_M)
        for _ in range(21):
            await client.get(f"/api/v1/referrals/r/{code}")
        await _admin(client)
        r = await client.get("/api/v1/admin/marketers/report")
        suspicious = r.json()["suspicious"]
        assert len(suspicious) >= 1
        assert suspicious[0]["reason"] == "click_flood"


class TestPayoutsBankConsent:
    """Production v5 — settlement with receipt, encrypted bank data, consent gate."""

    async def _setup_commission(
        self, client, seeded_session, *, rate=10, amount=10_000_000, consent=True
    ):
        row_s = await seeded_session.get(SiteSetting, "commission")
        row_s.value = {
            **(row_s.value or {}),
            "marketing_enabled": True,
            "default_rate": rate,
        }
        await seeded_session.commit()
        code = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        row = await _consult_row(
            seeded_session, client, PHONE_B, ref=code, consent=consent
        )
        await _set_status(client, row.id, "accepted")
        r = await client.post(
            f"/api/v1/admin/requests/consultation/{row.id}/fee-receipts",
            json={"amount": amount},
        )
        assert r.status_code == 201, r.text
        return code, row

    async def test_consent_gate_no_commission_no_name(self, client, seeded_session):
        """بدون تیک رضایت — نه کمیسیون، نه نام."""
        code, row = await self._setup_commission(client, seeded_session, consent=False)
        assert (
            await seeded_session.execute(select(Commission))
        ).scalar_one_or_none() is None
        await _login_user(client, PHONE_M)
        rows = (await client.get("/api/v1/account/marketer/referrals")).json()
        assert rows[0]["consent"] is False
        assert rows[0]["full_name"] is None
        assert rows[0]["commission_amount"] is None

    async def test_payout_with_receipt_flow(self, client, seeded_session):
        """ادمین تسویه می‌کند با فیش → بازاریاب پرداخت و فیش را می‌بیند."""
        from main.models.account import MarketerProfile, Payout

        code, _ = await self._setup_commission(client, seeded_session)
        comm = (await seeded_session.execute(select(Commission))).scalar_one()
        prof = (await seeded_session.execute(select(MarketerProfile))).scalar_one()
        r = await client.post(f"/api/v1/admin/commissions/{comm.id}/approve")
        assert r.status_code == 200

        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (20, 20), (255, 255, 255)).save(buf, "PNG")
        buf.seek(0)
        r = await client.post(
            f"/api/v1/admin/marketers/{prof.id}/payouts",
            data={"tracking_ref": "12345", "note": "تسویه اول"},
            files={"file": ("receipt.png", buf, "image/png")},
        )
        assert r.status_code == 201, r.text
        payout = (await seeded_session.execute(select(Payout))).scalar_one()
        assert payout.amount == 1_000_000
        await seeded_session.refresh(comm)
        assert comm.status == "paid" and comm.payout_id == payout.id

        # marketer sees it
        await _login_user(client, PHONE_M)
        pays = (await client.get("/api/v1/account/payments")).json()
        items = pays["items"]
        assert len(items) == 1 and items[0]["amount"] == 1_000_000
        assert items[0]["receipt_url"].endswith(f"{payout.id}/receipt")
        r = await client.get(f"/api/v1/account/payments/{payout.id}/receipt")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/")

    async def test_payout_never_exceeds_payable(self, client, seeded_session):
        from main.models.account import MarketerProfile

        code, _ = await self._setup_commission(client, seeded_session)
        comm = (await seeded_session.execute(select(Commission))).scalar_one()
        prof = (await seeded_session.execute(select(MarketerProfile))).scalar_one()
        await client.post(f"/api/v1/admin/commissions/{comm.id}/approve")
        r = await client.post(
            f"/api/v1/admin/marketers/{prof.id}/payouts",
            data={"amount": "99999999"},
        )
        assert r.status_code == 409

    async def test_bank_details_encrypted_masked(self, client, seeded_session):
        """Luhn + IBAN mod97 → AES at rest → masked out → hold set."""
        from main.models.account import MarketerProfile

        await _make_marketer(client, seeded_session, PHONE_M)
        card = "6037997531234566"  # Luhn-valid 16-digit card
        iban = "IR062960000000100324200001"
        r = await client.put(
            "/api/v1/account/marketer/bank",
            json={"account_name": "بازاریاب تست", "card_number": card, "iban": iban},
        )
        assert r.status_code == 200, r.text
        prof = (await seeded_session.execute(select(MarketerProfile))).scalar_one()
        # ciphertext at rest — never plaintext
        assert card not in prof.card_enc and iban not in prof.iban_enc
        assert prof.card_enc.startswith("gcm:")
        assert prof.payout_hold_until is not None
        r = await client.get("/api/v1/account/marketer/bank")
        body = r.json()
        assert card not in str(body) and iban not in str(body)
        assert body["card_masked"] == "••••4566"
        assert body["iban_masked"] == "IR••••0001"
        # audit row exists
        from sqlalchemy import select as sel

        from main.models.audit import AuditLog

        (
            await seeded_session.execute(
                sel(AuditLog).where(AuditLog.action == "account.bank_update")
            )
        ).scalar_one()

    async def test_bank_validation_rejects_bad(self, client, seeded_session):
        await _make_marketer(client, seeded_session, PHONE_M)
        r = await client.put(
            "/api/v1/account/marketer/bank",
            json={
                "account_name": "x",
                "card_number": "1111111111111111",
                "iban": "IR001",
            },
        )
        assert r.status_code == 400

    async def test_rotate_code_old_resolves(self, client, seeded_session):
        from main.models.account import MarketerProfile

        old = await _make_marketer(client, seeded_session, PHONE_M)
        await _admin(client)
        prof = (await seeded_session.execute(select(MarketerProfile))).scalar_one()
        r = await client.post(f"/api/v1/admin/marketers/{prof.id}/rotate-code")
        assert r.status_code == 200
        new = r.json()["ref_code"]
        assert (
            new != old and new.startswith("DN-") and len(new) == 12
        )  # DN- + 8 + check
        # old code still resolves (retired) — past links keep attributing
        r = await client.get(f"/api/v1/referrals/r/{old}", follow_redirects=False)
        assert r.status_code == 302
        assert "dn_ref" in r.headers["set-cookie"]

    async def test_reveal_bank_audited(self, client, seeded_session):
        from main.models.account import MarketerProfile
        from main.models.audit import AuditLog
        from sqlalchemy import select as sel

        await _make_marketer(client, seeded_session, PHONE_M)
        prof = (await seeded_session.execute(select(MarketerProfile))).scalar_one()
        await _admin(client)
        r = await client.post(f"/api/v1/admin/marketers/{prof.id}/reveal-bank")
        assert r.status_code == 200
        (
            await seeded_session.execute(
                sel(AuditLog).where(AuditLog.action == "marketer.reveal_bank")
            )
        ).scalar_one()
