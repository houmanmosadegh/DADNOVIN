"""Public read APIs — content exposure + privacy guarantees."""


async def test_public_settings_only_public_keys(client):
    resp = await client.get("/api/v1/public/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert "brand" in body and "contact" in body
    assert body["brand"]["name"] == "دادنوین"
    assert body["contact"]["phones"] == ["09150463006", "09150539176"]


async def test_public_pages_have_sections(client):
    resp = await client.get("/api/v1/public/pages/home")
    assert resp.status_code == 200
    body = resp.json()
    keys = {s["key"] for s in body["sections"]}
    assert "hero" in keys and "about" in keys
    hero = next(s for s in body["sections"] if s["key"] == "hero")
    assert hero["content"]["title"].strip()


async def test_public_lawyers_sanitized(client):
    resp = await client.get("/api/v1/public/lawyers")
    assert resp.status_code == 200
    lawyers = resp.json()
    assert {lw["slug"] for lw in lawyers} == {"vaziri", "mirzadeh"}
    for lw in lawyers:
        # no private fields, no internals
        assert "privateNotDisplayed" not in lw
        assert "is_visible" not in lw
        assert "id" not in lw
        assert "phone" not in lw["resume"]


async def test_hidden_lawyer_not_in_public(client, seeded_session):
    from sqlalchemy import select

    from main.models.lawyer import Lawyer

    lw = (
        await seeded_session.execute(select(Lawyer).where(Lawyer.slug == "vaziri"))
    ).scalar_one()
    lw.is_visible = False
    await seeded_session.commit()
    resp = await client.get("/api/v1/public/lawyers")
    assert {lw["slug"] for lw in resp.json()} == {"mirzadeh"}
    resp = await client.get("/api/v1/public/lawyers/vaziri")
    assert resp.status_code == 404


async def test_unpublished_page_404(client, seeded_session):
    from sqlalchemy import select

    from main.models.content import Page

    page = (
        await seeded_session.execute(select(Page).where(Page.slug == "contact"))
    ).scalar_one()
    page.is_published = False
    await seeded_session.commit()
    resp = await client.get("/api/v1/public/pages/contact")
    assert resp.status_code == 404
