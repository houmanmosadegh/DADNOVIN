"""Development-only demo seed — clearly fake data for local workflows.

NEVER run in production: creates a demo customer, an approved demo marketer,
a sample consultation request and a published sample article so every
dashboard/flow has something to show. Idempotent (keyed on usernames/slugs).

Usage: python -m main.cli seed-dev
"""

import asyncio
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db.session import SessionFactory
from .models.account import MarketerProfile
from .models.consultation import ConsultationRequest
from .models.request_ops import Article
from .models.user import Role, User
from .security.passwords import hash_password
from .services import referrals as ref_svc
from .services import thread as thread_svc
from .utils.ids import access_code

DEMO_PASSWORD = "Dev-Demo-1234"


async def _demo_user(
    db: AsyncSession, username: str, name: str, role_names: list[str], phone: str
) -> User:
    user = (
        await db.execute(select(User).where(func.lower(User.username) == username))
    ).scalar_one_or_none()
    if user is not None:
        return user
    roles = (
        (await db.execute(select(Role).where(Role.name.in_(role_names))))
        .scalars()
        .all()
    )
    user = User(
        username=username,
        email="",
        phone=phone,
        full_name=name,
        password_hash=hash_password(DEMO_PASSWORD),
        roles=roles,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def run_seed_dev(db: AsyncSession) -> dict:
    from .seed import _seed_roles

    await _seed_roles(db)
    counts = {"users": 0, "marketer": 0, "consultation": 0, "article": 0}

    customer = await _demo_user(db, "demo", "کاربر نمونه", ["user"], "09120000000")
    counts["users"] += 1 if customer else 0

    mk_user = await _demo_user(
        db, "demo-marketer", "بازاریاب نمونه", ["marketer"], "09121111111"
    )
    prof = (
        await db.execute(
            select(MarketerProfile).where(MarketerProfile.user_id == mk_user.id)
        )
    ).scalar_one_or_none()
    if prof is None:
        prof = MarketerProfile(
            user_id=mk_user.id,
            ref_code=ref_svc.gen_ref_code(),
            is_active=True,
            custom_rate=None,
        )
        db.add(prof)
        counts["marketer"] += 1

    consult = (
        await db.execute(
            select(ConsultationRequest).where(
                ConsultationRequest.user_id == customer.id
            )
        )
    ).scalar_one_or_none()
    if consult is None:
        code = access_code()
        db.add(
            ConsultationRequest(
                tracking_code=await thread_svc.next_tracking_code(db, "consultation"),
                access_code_hash=hash_password(code),
                full_name="کاربر نمونه",
                phone="09120000000",
                email="",
                service_slug="family",
                topic="نمونه — مشاوره خانواده",
                message="این یک درخواست مشاورهٔ نمونه برای محیط توسعه است.",
                status="new",
                source_page="seed-dev",
                client_ip="127.0.0.1",
                client_ua="seed-dev",
                user_id=customer.id,
            )
        )
        counts["consultation"] += 1

    article = (
        await db.execute(select(Article).where(Article.slug == "nemune-dev"))
    ).scalar_one_or_none()
    if article is None:
        db.add(
            Article(
                slug="nemune-dev",
                title="مقالهٔ نمونهٔ توسعه",
                excerpt="متن نمونه برای بررسی چیدمان صفحهٔ مقاله در محیط توسعه.",
                body="<p>این یک مقالهٔ نمونه است که فقط در محیط توسعه ایجاد می‌شود.</p>"
                "<h2>بخش نمونه</h2><p>متن بیشتر برای محتوای آزمایشی.</p>",
                seo_title="مقالهٔ نمونه",
                seo_description="مقالهٔ نمونه برای توسعه",
                category="عمومی",
                tags=["نمونه"],
                author_name="تحریریه",
                status="published",
                published_at=datetime.now(UTC),
                read_time_min=1,
            )
        )
        counts["article"] += 1

    await db.commit()
    return counts


def main() -> None:
    async def _run() -> None:
        async with SessionFactory() as db:
            counts = await run_seed_dev(db)
        print("seed-dev done:", counts)
        print(
            f"demo login — user: demo / {DEMO_PASSWORD}  |  marketer: demo-marketer / {DEMO_PASSWORD}"
        )

    asyncio.run(_run())


if __name__ == "__main__":
    main()
