"""Idempotent database seed from the site's public content dump.

`seed/site_content.json` is generated from `frontend/src/content/lawyers.fa.js`
(the frontend's single source of truth). Every upsert is keyed so re-running
never duplicates — and it NEVER overwrites admin-edited content: a row is only
written when it does not exist yet.
"""

import asyncio
import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .ai.knowledge import sync_knowledge
from .db.session import SessionFactory
from .models.content import Page, PageSection, SiteSetting
from .models.lawyer import Lawyer
from .models.user import Role
from .utils.phone import normalize_phone

SEED_FILE = Path(__file__).resolve().parent.parent / "seed" / "site_content.json"

ROLES = [
    ("super_admin", "مدیر ارشد — دسترسی کامل شامل مدیریت کاربران"),
    ("admin", "مدیر — همهٔ بخش‌ها به‌جز مدیریت کاربران"),
    ("editor", "ویرایشگر محتوا — صفحات، تنظیمات، وکلا، رسانه"),
    ("support", "پشتیبان — درخواست‌های مشاوره و تیکت‌ها"),
]


def _load() -> dict:
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


async def _seed_roles(db: AsyncSession) -> None:
    existing = {
        r.name for r in (await db.execute(select(Role))).scalars()
    }
    for name, desc in ROLES:
        if name not in existing:
            db.add(Role(name=name, description=desc))
    await db.flush()


async def _seed_setting(
    db: AsyncSession, key: str, value: dict, is_public: bool
) -> bool:
    """Insert only if absent — preserves admin edits on re-seed."""
    if await db.get(SiteSetting, key) is not None:
        return False
    db.add(SiteSetting(key=key, value=value, is_public=is_public))
    await db.flush()
    return True


async def _seed_settings(db: AsyncSession, c: dict) -> int:
    n = 0
    brand = dict(c["brand"])
    brand["siteUrl"] = c["siteUrl"]
    n += await _seed_setting(db, "brand", brand, True)
    contact = dict(c["contact"])
    contact["address"] = contact.get("address") or ""
    n += await _seed_setting(db, "contact", contact, True)
    n += await _seed_setting(db, "seo", {k: v for k, v in c["seo"].items()}, True)
    n += await _seed_setting(
        db,
        "socials",
        {"items": contact.get("socials", [])},
        True,
    )
    n += await _seed_setting(
        db,
        "footer",
        {
            "description": brand.get("description", ""),
            "copyright": f"© {brand.get('legalName', 'گروه حقوقی دادنوین')} — کلیه حقوق محفوظ است.",
        },
        True,
    )
    n += await _seed_setting(
        db,
        "ai",
        {
            "enabled": True,
            "welcome": c["aiConsultant"]["chat"]["welcome"],
            "placeholder": c["aiConsultant"]["chat"]["placeholder"],
        },
        True,
    )
    return n


def _page_sections(c: dict) -> dict[str, dict[str, dict]]:
    """Page slug → {section_key: {kind, content}}."""
    h = c["home"]
    cp = c["consultationPage"]
    ctp = c["contactPage"]
    return {
        "home": {
            "hero": {"kind": "hero", "content": h["hero"]},
            "stats": {"kind": "stats", "content": h["stats"]},
            "about": {"kind": "rich", "content": h["about"]},
            "services_head": {"kind": "text", "content": h["services"]},
            "picture": {"kind": "media", "content": h["picture"]},
            "lawyers_head": {"kind": "text", "content": h["lawyers"]},
            "cta_band": {"kind": "cta", "content": h["ctaBand"]},
        },
        "about": {
            "head": {
                "kind": "head",
                "content": {
                    k: c["aboutPage"][k]
                    for k in ("title", "lead", "tagline", "membersTitle", "trustTitle", "cardCta", "directLine")
                    if k in c["aboutPage"]
                },
            },
            "paragraphs": {"kind": "rich", "content": {"items": c["aboutPage"]["paragraphs"]}},
            "trust": {"kind": "list", "content": {"items": c["aboutPage"]["trust"]}},
        },
        "services": {
            "head": {
                "kind": "head",
                "content": c["servicesPage"],
            },
            "items": {
                "kind": "services",
                "content": {"items": c["services"]},
            },
        },
        "consultation": {
            "head": {"kind": "head", "content": {k: cp[k] for k in ("title", "lead")}},
            "for_whom": {"kind": "list", "content": cp["forWhom"]},
            "receive": {"kind": "list", "content": cp["receive"]},
            "prepare": {"kind": "list", "content": cp["prepare"]},
            "faqs": {"kind": "faq", "content": {"title": cp["faqsTitle"], "items": cp["faqs"]}},
            "steps": {"kind": "steps", "content": {"items": cp["steps"]}},
            "note": {"kind": "text", "content": {"text": cp["note"]}},
        },
        "contact": {
            "head": {"kind": "head", "content": {k: ctp[k] for k in ctp if k != "form"}},
        },
    }


async def _seed_pages(db: AsyncSession, c: dict) -> int:
    n = 0
    seo = c["seo"]
    page_meta = {
        "home": ("صفحه اصلی", seo["home"], 0),
        "about": ("درباره ما", seo["about"], 1),
        "services": ("خدمات حقوقی", seo["services"], 2),
        "consultation": ("درخواست مشاوره", seo["consultation"], 3),
        "contact": ("تماس با ما", seo["contact"], 4),
    }
    sections_map = _page_sections(c)
    for slug, (title, meta, order) in page_meta.items():
        page = (
            await db.execute(select(Page).where(Page.slug == slug))
        ).scalar_one_or_none()
        if page is None:
            page = Page(
                slug=slug,
                title=title,
                seo_title=meta["title"],
                seo_description=meta["description"],
                sort_order=order,
            )
            db.add(page)
            await db.flush()
            n += 1
        existing_keys = set(
            (
                await db.execute(
                    select(PageSection.key).where(PageSection.page_id == page.id)
                )
            ).scalars()
        )
        for i, (key, spec) in enumerate(sections_map.get(slug, {}).items()):
            if key in existing_keys:
                continue
            db.add(
                PageSection(
                    page_id=page.id,
                    key=key,
                    kind=spec["kind"],
                    content=spec["content"],
                    sort_order=i,
                )
            )
        await db.flush()
    return n


async def _seed_lawyers(db: AsyncSession, c: dict) -> int:
    n = 0
    for i, lw in enumerate(c["lawyers"]):
        exists = (
            await db.execute(
                select(func.count(Lawyer.id)).where(Lawyer.slug == lw["id"])
            )
        ).scalar_one()
        if exists:
            continue
        resume = dict(lw.get("resume") or {})
        phone = normalize_phone(resume.pop("phone", "") or "")
        email = resume.pop("email", "") or ""
        db.add(
            Lawyer(
                slug=lw["id"],
                name=lw["name"],
                title=lw["title"],
                bio=lw.get("bio", ""),
                specialties=lw.get("specialties", []),
                resume=resume,
                portrait_path=lw.get("portrait") or "",
                phone=phone,
                email=email,
                sort_order=i,
                is_visible=True,
            )
        )
        n += 1
    await db.flush()
    return n


async def run_seed(db: AsyncSession) -> dict:
    """Seed roles/settings/pages/lawyers + refresh AI knowledge."""
    await _seed_roles(db)
    counts = {
        "settings": await _seed_settings(db, c := _load()),
        "pages": await _seed_pages(db, c),
        "lawyers": await _seed_lawyers(db, c),
    }
    await db.flush()
    counts["knowledge"] = await sync_knowledge(db)
    await db.commit()
    return counts


def main() -> None:
    async def _run() -> None:
        async with SessionFactory() as db:
            counts = await run_seed(db)
        print("seed done:", counts)

    asyncio.run(_run())


if __name__ == "__main__":
    main()
