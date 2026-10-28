"""Consultation: public submit → admin visibility + workflow."""

VALID = {
    "full_name": "علی رضایی",
    "phone": "۰۹۱۲۳۴۵۶۷۸۹",  # Persian digits must normalize
    "email": "ali@example.com",
    "service_slug": "family-law",
    "topic": "طلاق",
    "message": "شرح موضوع تست",
    "source_page": "/consultation",
    "website": "",
}


async def test_public_submit_and_admin_sees_it(client, admin_client):
    resp = await client.post("/api/v1/consultations", json=VALID)
    assert resp.status_code == 201
    rid = resp.json()["id"]

    lst = await admin_client.get("/api/v1/admin/consultations")
    assert lst.status_code == 200
    items = lst.json()["items"]
    assert any(i["id"] == rid for i in items)
    item = next(i for i in items if i["id"] == rid)
    assert item["phone"] == "09123456789"  # normalized
    assert item["status"] == "new"


async def test_submit_validation_errors(client):
    bad = dict(VALID, phone="123")
    resp = await client.post("/api/v1/consultations", json=bad)
    assert resp.status_code == 422

    bad = dict(VALID, full_name="x")
    resp = await client.post("/api/v1/consultations", json=bad)
    assert resp.status_code == 422


async def test_honeypot_accepted_but_not_stored(client, admin_client):
    spam = dict(VALID, website="http://spam")
    resp = await client.post("/api/v1/consultations", json=spam)
    assert resp.status_code == 201
    lst = await admin_client.get("/api/v1/admin/consultations")
    assert lst.json()["total"] == 0


async def test_status_workflow_and_notes(client, admin_client):
    await client.post("/api/v1/consultations", json=VALID)
    item = (await admin_client.get("/api/v1/admin/consultations")).json()["items"][0]

    resp = await admin_client.patch(
        f"/api/v1/admin/consultations/{item['id']}", json={"status": "reviewing"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "reviewing"

    resp = await admin_client.patch(
        f"/api/v1/admin/consultations/{item['id']}", json={"status": "bogus"}
    )
    assert resp.status_code == 422

    note = await admin_client.post(
        f"/api/v1/admin/consultations/{item['id']}/notes",
        json={"body": "تماس گرفته شد"},
    )
    assert note.status_code == 201

    detail = await admin_client.get(f"/api/v1/admin/consultations/{item['id']}")
    assert detail.json()["notes"][0]["body"] == "تماس گرفته شد"


async def test_public_cannot_list_consultations(client):
    assert (await client.get("/api/v1/admin/consultations")).status_code == 401
