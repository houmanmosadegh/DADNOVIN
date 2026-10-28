"""Tickets: create → customer track via code → staff reply → notes hidden."""

TICKET = {
    "requester_name": "مریم احمدی",
    "requester_phone": "09121112233",
    "requester_email": "m@example.com",
    "subject": "پیگیری پرونده",
    "category": "follow-up",
    "body": "سلام، دربارهٔ پرونده‌ام سؤال دارم.",
    "website": "",
}


async def _create(client):
    resp = await client.post("/api/v1/tickets", json=TICKET)
    assert resp.status_code == 201
    return resp.json()


async def test_create_track_reply_cycle(client, admin_client):
    created = await _create(client)
    assert created["ticket_number"].startswith("DN-")
    code = created["access_code"]

    # customer tracks with number + code
    track = await client.post(
        "/api/v1/tickets/track",
        json={"ticket_number": created["ticket_number"], "access_code": code},
    )
    assert track.status_code == 200
    body = track.json()
    assert body["status"] == "new"
    assert len(body["messages"]) == 1

    # staff finds it, replies + adds internal note
    lst = await admin_client.get("/api/v1/admin/tickets")
    tid = lst.json()["items"][0]["id"]
    reply = await admin_client.post(
        f"/api/v1/admin/tickets/{tid}/messages",
        json={"body": "پاسخ کارشناس", "is_note": False},
    )
    assert reply.status_code == 201
    await admin_client.post(
        f"/api/v1/admin/tickets/{tid}/messages",
        json={"body": "یادداشت داخلی محرمانه", "is_note": True},
    )

    # customer sees staff reply but NOT the internal note
    track = await client.post(
        "/api/v1/tickets/track",
        json={"ticket_number": created["ticket_number"], "access_code": code},
    )
    texts = [m["body"] for m in track.json()["messages"]]
    assert "پاسخ کارشناس" in texts
    assert "یادداشت داخلی محرمانه" not in texts


async def test_wrong_access_code_404(client):
    created = await _create(client)
    resp = await client.post(
        "/api/v1/tickets/track",
        json={"ticket_number": created["ticket_number"], "access_code": "WRONGCOD"},
    )
    assert resp.status_code == 404


async def test_ticket_enumeration_impossible(client):
    await _create(client)
    resp = await client.post(
        "/api/v1/tickets/track",
        json={"ticket_number": "DN-00001", "access_code": "AAAAAAAA"},
    )
    assert resp.status_code == 404


async def test_admin_status_patch(client, admin_client):
    await _create(client)
    tid = (await admin_client.get("/api/v1/admin/tickets")).json()["items"][0]["id"]
    # direct new→resolved is rejected by the transition validator
    resp = await admin_client.patch(
        f"/api/v1/admin/tickets/{tid}", json={"status": "resolved", "priority": "high"}
    )
    assert resp.status_code == 409
    # legal path: new → reviewing → resolved
    resp = await admin_client.patch(
        f"/api/v1/admin/tickets/{tid}", json={"status": "reviewing", "priority": "high"}
    )
    assert resp.status_code == 200
    resp = await admin_client.patch(
        f"/api/v1/admin/tickets/{tid}", json={"status": "resolved"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "resolved"
