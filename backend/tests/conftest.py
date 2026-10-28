"""Shared fixtures — app instance + isolated SQLite session per test."""

import os

# must run before any app/settings import (get_settings is lru_cached)
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("RATE_LIMIT_LOGIN_PER_MINUTE", "1000")
os.environ.setdefault("RATE_LIMIT_PUBLIC_POST_PER_MINUTE", "1000")
os.environ.setdefault("RATE_LIMIT_AI_PER_MINUTE", "1000")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from main import models  # noqa: F401
from main.db.base import Base
from main.db.session import get_db
from main.main import create_app
from main.models.user import Role, User
from main.security.passwords import hash_password
from main.seed import _seed_settings, _load, _seed_pages, _seed_lawyers, _seed_roles

ADMIN_USER = "admin"
ADMIN_PASS = "Str0ng!Passw0rd"
EDITOR_USER = "editor"
SUPPORT_USER = "support"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def seeded_session(db_session):
    await _seed_roles(db_session)
    c = _load()
    await _seed_settings(db_session, c)
    await _seed_pages(db_session, c)
    await _seed_lawyers(db_session, c)

    roles = {
        r.name: r
        for r in (await db_session.execute(select(Role))).scalars()
    }
    for uname, rname in (
        (ADMIN_USER, "super_admin"),
        (EDITOR_USER, "editor"),
        (SUPPORT_USER, "support"),
    ):
        db_session.add(
            User(
                username=uname,
                full_name=uname,
                password_hash=hash_password(ADMIN_PASS),
                roles=[roles[rname]],
            )
        )
    await db_session.commit()
    return db_session


@pytest_asyncio.fixture
async def client(seeded_session):
    app = create_app()

    async def _override_db():
        yield seeded_session

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def admin_client(client):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
    )
    assert resp.status_code == 200, resp.text
    return client


async def login_as(client, username: str):
    resp = await client.post(
        "/api/v1/auth/login", json={"username": username, "password": ADMIN_PASS}
    )
    assert resp.status_code == 200, resp.text
    return client
