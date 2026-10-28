"""Admin bootstrap CLI — explicit, audited; never ships a default password.

Usage:
    python -m main.cli bootstrap-admin --username admin --password 'S3cure!Pass' [--name نام] [--email a@b.c]
    python -m main.cli seed
"""

import argparse
import asyncio
import sys

from sqlalchemy import func, select

from .db.session import SessionFactory
from .models.user import Role, User
from .security.passwords import hash_password
from .seed import run_seed


async def _bootstrap_admin(username: str, password: str, name: str, email: str) -> int:
    if len(password) < 10:
        print("error: password must be at least 10 characters", file=sys.stderr)
        return 2
    username = username.strip().lower()
    async with SessionFactory() as db:
        exists = (
            await db.execute(
                select(func.count(User.id)).where(func.lower(User.username) == username)
            )
        ).scalar_one()
        if exists:
            print(f"error: user {username} already exists", file=sys.stderr)
            return 3
        role = (
            await db.execute(select(Role).where(Role.name == "super_admin"))
        ).scalar_one_or_none()
        if role is None:
            # seed roles first so bootstrap works on a fresh DB
            from .seed import _seed_roles

            await _seed_roles(db)
            role = (
                await db.execute(select(Role).where(Role.name == "super_admin"))
            ).scalar_one()
        user = User(
            username=username,
            email=email.strip().lower(),
            full_name=name.strip(),
            password_hash=hash_password(password),
            roles=[role],
        )
        db.add(user)
        await db.commit()
        print(f"super_admin created: {username}")
        return 0


def main() -> int:
    p = argparse.ArgumentParser(prog="python -m main.cli")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("bootstrap-admin", help="create the first super admin")
    b.add_argument("--username", required=True)
    b.add_argument("--password", required=True)
    b.add_argument("--name", default="مدیر مجموعه")
    b.add_argument("--email", default="")

    sub.add_parser("seed", help="idempotent content + role seed")

    args = p.parse_args()
    if args.cmd == "bootstrap-admin":
        return asyncio.run(_bootstrap_admin(args.username, args.password, args.name, args.email))
    if args.cmd == "seed":
        async def _run() -> int:
            async with SessionFactory() as db:
                counts = await run_seed(db)
            print("seed done:", counts)
            return 0

        return asyncio.run(_run())
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
