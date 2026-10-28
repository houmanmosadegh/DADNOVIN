"""Unified request layer — inbox, tracking, replies, transitions, deliveries."""

import re
import uuid

from sqlalchemy import select

from main.models.audit import AuditLog
from main.models.request_ops import OutboundDelivery, RequestMessage
from tests.conftest import login_as

CONSULT = {
    "full_name": "علی رضایی",
    "phone": "09121234567",
    "email": "ali@example.com",
    "service_slug": "family",
    "topic": "طلاق توافقی",
    "message": "سؤال دربارهٔ مهریه",
    "source_page": "/consultation",
    "website": "",
}

CONTACT = {
    "full_name": "سارا محمدی",
    "phone": "02122334455",
    "subject": "درخواست تماس",
    "message": "لطفاً تماس بگیرید",
    "preferred_time": "عصر",
    "website": "",
}

CODE_RE = re.compile(r"^DN-\d{4}-\d{4}$")


async def _consultation(client):
    resp = await client.post("/api/v1/consultations", json=CONSULT)
    assert resp.status_code == 201
    return resp.json()


async def _contact(client):
    resp = await client.post("/api/v1/contacts", json=CONTACT)
    assert resp.status_code == 201
    return resp.json()


async def test_consultation_gets_tracking_code(client, db_session):
    created = await _consultation(client)
    assert CODE_RE.match(created["tracking_code"])
    assert len(created["access_code"]) == 8


async def test_contact_submit_and_track(client):
    created = await _contact(client)
    assert CODE_RE.match(created["tracking_code"])

    track = await client.post(
        "/api/v1/public/track",
        json={"code": created["tracking_code"], "credential": created["access_code"]},
    )
    assert track.status_code == 200
    body = track.json()
    assert body["type"] == "contact"
    assert body["status"] == "new"

    # phone number also works as credential
    track2 = await client.post(
        "/api/v1/public/track",
        json={"code": created["tracking_code"], "credential": CONTACT["phone"]},
    )
    assert track2.status_code == 200

    # wrong credential → generic 404
    bad = await client.post(
        "/api/v1/public/track",
        json={"code": created["tracking_code"], "credential": "BADCRED1"},
    )
    assert bad.status_code == 404


async def test_unified_track_for_consultation(client):
    created = await _consultation(client)
    track = await client.post(
        "/api/v1/public/track",
        json={"code": created["tracking_code"], "credential": created["access_code"]},
    )
    assert track.status_code == 200
    assert track.json()["type"] == "consultation"


async def test_inbox_lists_all_types(client, admin_client):
    await _consultation(client)
    await _contact(client)
    resp = await admin_client.get("/api/v1/admin/inbox")
    assert resp.status_code == 200
    body = resp.json()
    types = {r["type"] for r in body["items"]}
    assert {"consultation", "contact"} <= types

    # tab=new filters to status new
    resp = await admin_client.get("/api/v1/admin/inbox?tab=new")
    assert all(r["status"] == "new" for r in resp.json()["items"])

    # type filter
    resp = await admin_client.get("/api/v1/admin/inbox?type=contact")
    assert all(r["type"] == "contact" for r in resp.json()["items"])
    assert resp.json()["total"] == 1

    # search by name
    resp = await admin_client.get("/api/v1/admin/inbox?q=سارا")
    assert resp.json()["total"] == 1

    # CSV export
    resp = await admin_client.get("/api/v1/admin/inbox.csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "tracking_code" in resp.text


async def test_staff_reply_flow(client, admin_client, db_session):
    created = await _contact(client)
    inbox = await admin_client.get("/api/v1/admin/inbox?type=contact")
    rid = inbox.json()["items"][0]["id"]

    detail = await admin_client.get(f"/api/v1/admin/requests/contact/{rid}")
    assert detail.status_code == 200
    assert detail.json()["requester"]["name"] == "سارا محمدی"

    # staff reply over the track channel → delivery recorded, first_response set
    reply = await admin_client.post(
        f"/api/v1/admin/requests/contact/{rid}/messages",
        json={"body": "در اسرع وقت تماس می‌گیریم", "is_note": False,
              "channels": ["track", "sms"]},
    )
    assert reply.status_code == 201

    deliveries = (
        await db_session.execute(
            select(OutboundDelivery)
            .join(RequestMessage, RequestMessage.id == OutboundDelivery.message_id)
            .where(RequestMessage.request_id == uuid.UUID(rid))
        )
    ).scalars().all()
    channels = {d.channel for d in deliveries}
    assert channels == {"track", "sms"}
    assert all(d.status == "sent" for d in deliveries)
    assert {d.provider for d in deliveries} == {"internal", "mock"}

    detail = await admin_client.get(f"/api/v1/admin/requests/contact/{rid}")
    assert detail.json()["request"]["first_response_at"] is not None
    assert detail.json()["request"]["status"] == "contacted"

    # customer sees the reply on the public thread
    track = await client.post(
        "/api/v1/public/track",
        json={"code": created["tracking_code"], "credential": created["access_code"]},
    )
    bodies = [m["body"] for m in track.json()["messages"]]
    assert "در اسرع وقت تماس می‌گیریم" in bodies


async def test_customer_reply_reopens(client, admin_client):
    created = await _contact(client)
    rid = (await admin_client.get("/api/v1/admin/inbox?type=contact")).json()["items"][0]["id"]
    await admin_client.post(
        f"/api/v1/admin/requests/contact/{rid}/status",
        json={"status": "contacted"},
    )
    resp = await client.post(
        "/api/v1/public/track/reply",
        json={"code": created["tracking_code"],
              "credential": created["access_code"], "body": "منتظرم"},
    )
    assert resp.status_code == 201
    detail = await admin_client.get(f"/api/v1/admin/requests/contact/{rid}")
    assert detail.json()["request"]["status"] == "new"


async def test_status_transition_rules(client, admin_client):
    await _consultation(client)
    rid = (
        await admin_client.get("/api/v1/admin/inbox?type=consultation")
    ).json()["items"][0]["id"]

    # invalid jump: new → completed
    bad = await admin_client.post(
        f"/api/v1/admin/requests/consultation/{rid}/status",
        json={"status": "completed"},
    )
    assert bad.status_code == 409

    # cancel without reason → 422
    bad = await admin_client.post(
        f"/api/v1/admin/requests/consultation/{rid}/status",
        json={"status": "cancelled"},
    )
    assert bad.status_code == 422

    # legal path
    ok = await admin_client.post(
        f"/api/v1/admin/requests/consultation/{rid}/status",
        json={"status": "reviewing"},
    )
    assert ok.status_code == 200
    assert "awaiting_call" in ok.json()["allowed_transitions"]

    ok = await admin_client.post(
        f"/api/v1/admin/requests/consultation/{rid}/status",
        json={"status": "cancelled", "reason": "تماس برقرار نشد"},
    )
    assert ok.status_code == 200


async def test_assignment_and_labels(client, admin_client, db_session):
    await _consultation(client)
    rid = (
        await admin_client.get("/api/v1/admin/inbox?type=consultation")
    ).json()["items"][0]["id"]

    assignees = (await admin_client.get("/api/v1/admin/assignees")).json()
    target = next(a for a in assignees if a["username"] == "support")

    label = await admin_client.post(
        "/api/v1/admin/labels", json={"name": "فوری", "color": "crimson"}
    )
    assert label.status_code == 201
    lid = label.json()["id"]

    resp = await admin_client.patch(
        f"/api/v1/admin/requests/consultation/{rid}",
        json={"assigned_to": target["id"], "priority": "high",
              "label_ids": [lid]},
    )
    assert resp.status_code == 200

    detail = await admin_client.get(f"/api/v1/admin/requests/consultation/{rid}")
    body = detail.json()
    assert body["labels"][0]["name"] == "فوری"
    assert any(e["event_type"] == "assigned" for e in body["events"])

    # mine tab shows it to the support user
    await login_as(admin_client, "support")
    mine = await admin_client.get("/api/v1/admin/inbox?tab=mine")
    assert any(r["id"] == rid for r in mine.json()["items"])


async def test_audit_before_after(client, admin_client, db_session):
    await _contact(client)
    rid = (await admin_client.get("/api/v1/admin/inbox?type=contact")).json()["items"][0]["id"]
    await admin_client.post(
        f"/api/v1/admin/requests/contact/{rid}/status",
        json={"status": "contacted"},
    )
    log = (
        await db_session.execute(
            select(AuditLog)
            .where(AuditLog.action == "request.status")
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
    ).scalar_one()
    assert log.before_json["status"] == "new"
    assert log.after_json["status"] == "contacted"


async def test_articles_crud_rbac(client, admin_client):
    # support cannot manage articles (content is an editor permission)
    await login_as(admin_client, "support")
    denied = await admin_client.get("/api/v1/admin/articles")
    assert denied.status_code == 403

    await login_as(admin_client, "editor")
    created = await admin_client.post(
        "/api/v1/admin/articles",
        json={"slug": "family-law-101", "title": "راهنمای حقوق خانواده",
              "excerpt": "خلاصه", "body": "متن مقاله", "status": "draft"},
    )
    assert created.status_code == 201
    aid = created.json()["id"]

    published = await admin_client.patch(
        f"/api/v1/admin/articles/{aid}", json={"status": "published"}
    )
    assert published.status_code == 200
    assert published.json()["published_at"] is not None

    dup = await admin_client.post(
        "/api/v1/admin/articles",
        json={"slug": "family-law-101", "title": "تکراری"},
    )
    assert dup.status_code == 409


async def test_call_log(client, admin_client):
    await _contact(client)
    rid = (await admin_client.get("/api/v1/admin/inbox?type=contact")).json()["items"][0]["id"]
    resp = await admin_client.post(
        f"/api/v1/admin/requests/contact/{rid}/call-log",
        json={"outcome": "answered", "note": "قرار جلسه گذاشته شد"},
    )
    assert resp.status_code == 201
    detail = await admin_client.get(f"/api/v1/admin/requests/contact/{rid}")
    assert any(e["event_type"] == "call_logged" for e in detail.json()["events"])


async def test_admin_contacts_module(admin_client, seeded_session):
    """Convenience /admin/contacts endpoints wrap the unified model."""
    resp = await admin_client.post(
        "/api/v1/contacts",
        json={
            "full_name": "تست تماس",
            "phone": "09120001111",
            "email": "",
            "subject": "درخواست تماس",
            "message": "پیام تست",
            "preferred_time": "",
            "source_page": "/contact",
            "website": "",
        },
    )
    assert resp.status_code == 201
    resp = await admin_client.get("/api/v1/admin/contacts")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    cid = body["items"][0]["id"]

    resp = await admin_client.get(f"/api/v1/admin/contacts/{cid}")
    assert resp.status_code == 200
    assert resp.json()["type"] == "contact"

    resp = await admin_client.post(
        f"/api/v1/admin/contacts/{cid}/call-log",
        json={"outcome": "answered", "note": "صحبت شد"},
    )
    assert resp.status_code == 201
    # status new → contacted after logged call
    resp = await admin_client.get(f"/api/v1/admin/contacts/{cid}")
    assert resp.json()["request"]["status"] == "contacted"

    resp = await admin_client.post(
        f"/api/v1/admin/contacts/{cid}/note", json={"note": "یادداشت"}
    )
    assert resp.status_code == 201

    resp = await admin_client.get(
        f"/api/v1/admin/contacts/{uuid.uuid4()}"
    )
    assert resp.status_code == 404


async def test_public_content_bundle(client, seeded_session):
    resp = await client.get("/api/v1/public/content")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"settings", "pages", "lawyers"}
    assert isinstance(body["pages"], list)
