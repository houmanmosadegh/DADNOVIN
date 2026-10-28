"""Sync approved site content into the AI knowledge corpus.

Only already-published, public information becomes knowledge — never
settings marked private, hidden lawyers, or admin notes.
"""

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.ai import AIKnowledgeSource
from ..models.content import Page, SiteSetting
from ..models.lawyer import Lawyer


def _hash(source_type: str, ref_id: str, payload: str) -> str:
    return hashlib.sha256(f"{source_type}:{ref_id}:{payload}".encode()).hexdigest()


async def _upsert(
    db: AsyncSession, *, source_type: str, ref_id: str, title: str, body: str
) -> tuple[AIKnowledgeSource, bool]:
    content_hash = _hash(source_type, ref_id, body)
    row = (
        await db.execute(
            select(AIKnowledgeSource).where(
                AIKnowledgeSource.source_type == source_type,
                AIKnowledgeSource.ref_id == ref_id,
            )
        )
    ).scalar_one_or_none()
    changed = False
    if row is None:
        row = AIKnowledgeSource(source_type=source_type, ref_id=ref_id)
        db.add(row)
        changed = True
    if row.content_hash != content_hash:
        row.title = title
        row.body = body
        row.content_hash = content_hash
        changed = True
    if changed:
        await db.flush()
    return row, changed


async def sync_knowledge(db: AsyncSession) -> int:
    """Rebuild knowledge from published content. Returns changed count."""
    changed = 0

    settings = {
        r.key: r.value
        for r in (
            await db.execute(select(SiteSetting).where(SiteSetting.is_public.is_(True)))
        ).scalars()
    }
    brand = settings.get("brand", {})
    contact = settings.get("contact", {})
    if brand:
        body = json.dumps(
            {
                "نام مجموعه": brand.get("name", "دادنوین"),
                "نام رسمی": brand.get("legalName", ""),
                "شهر": brand.get("city", ""),
                "شعار": brand.get("tagline", ""),
                "درباره": brand.get("description", ""),
            },
            ensure_ascii=False,
        )
        _, c = await _upsert(
            db, source_type="brand", ref_id="brand", title="درباره مجموعه دادنوین", body=body
        )
        changed += c
    if contact:
        body = json.dumps(
            {
                "تلفن‌ها": contact.get("phones", []),
                "واتس‌اپ": contact.get("whatsapp", ""),
                "ایمیل": contact.get("email", ""),
                "آدرس": contact.get("address", ""),
                "ساعات کاری": contact.get("hours", ""),
                "شبکه‌های اجتماعی": contact.get("socials", {}),
            },
            ensure_ascii=False,
        )
        _, c = await _upsert(
            db, source_type="contact", ref_id="contact", title="راه‌های تماس با دادنوین", body=body
        )
        changed += c

    pages = (
        await db.execute(select(Page).where(Page.is_published.is_(True)))
    ).scalars()
    for page in pages:
        parts = [f"عنوان صفحه: {page.title}"]
        for s in sorted(page.sections, key=lambda x: x.sort_order):
            if s.is_enabled and s.content:
                parts.append(f"[{s.key}] {json.dumps(s.content, ensure_ascii=False)}")
        _, c = await _upsert(
            db,
            source_type="page",
            ref_id=page.slug,
            title=page.title,
            body="\n".join(parts),
        )
        changed += c

    lawyers = (
        await db.execute(select(Lawyer).where(Lawyer.is_visible.is_(True)))
    ).scalars()
    for lw in lawyers:
        body = json.dumps(
            {
                "نام": lw.name,
                "عنوان": lw.title,
                "تخصص‌ها": lw.specialties,
                "بیو": lw.bio,
                "رزومه": {
                    k: v for k, v in (lw.resume or {}).items() if k != "notes"
                },
            },
            ensure_ascii=False,
        )
        _, c = await _upsert(
            db,
            source_type="lawyer",
            ref_id=lw.slug,
            title=f"وکیل — {lw.name}",
            body=body,
        )
        changed += c

    return changed
