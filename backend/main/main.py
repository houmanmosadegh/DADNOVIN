"""DADNOVIN backend — FastAPI application entrypoint."""

import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .api.router import account as account_router
from .api.router import ai as ai_router
from .api.router import auth as auth_router
from .api.router import consultations as consult_router
from .api.router import contacts as contacts_router
from .api.router import media as media_router
from .api.router import public as public_router
from .api.router import referrals as referrals_router
from .api.router import tickets as tickets_router
from .api.router.admin import ai as admin_ai
from .api.router.admin import articles as admin_articles
from .api.router.admin import audit as admin_audit
from .api.router.admin import consultations as admin_consultations
from .api.router.admin import contacts as admin_contacts
from .api.router.admin import dashboard as admin_dashboard
from .api.router.admin import lawyers as admin_lawyers
from .api.router.admin import marketers as admin_marketers
from .api.router.admin import media as admin_media
from .api.router.admin import labels as admin_labels
from .api.router.admin import pages as admin_pages
from .api.router.admin import requests as admin_requests
from .api.router.admin import settings as admin_settings
from .api.router.admin import tickets as admin_tickets
from .api.router.admin import users as admin_users
from .core.config import get_settings, validate_production_settings
from .core.logging import configure_logging
from .db.session import engine
from .security.csrf import csrf_violation
from .services.media import storage_root

log = logging.getLogger("dadnovin.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    validate_production_settings(get_settings())
    storage_root()  # ensure upload dir exists
    log.info("dadnovin backend starting")
    yield
    await engine.dispose()
    log.info("dadnovin backend stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="DADNOVIN API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.expose_docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.expose_docs else None,
    )

    # --- middleware -------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Requested-With"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request.state.request_id = uuid.uuid4().hex[:12]
        # CSRF: cookie-auth'd admin mutations must come from our own client
        if (violation := csrf_violation(request)) is not None:
            return JSONResponse(status_code=403, content={"detail": violation})
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("unhandled error", extra={"path": request.url.path})
        return JSONResponse(
            status_code=500,
            content={"detail": {"code": "internal", "message": "خطای داخلی سرور."}},
        )

    # --- routes -----------------------------------------------------------
    @app.get("/api/health", include_in_schema=False)
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/health/ready", include_in_schema=False)
    async def ready():
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return {"status": "ready", "db": "up"}
        except Exception:
            return JSONResponse(
                status_code=503,
                content={"status": "not_ready", "db": "down"},
            )

    api = "/api/v1"
    app.include_router(auth_router.router, prefix=api)
    app.include_router(public_router.router, prefix=api)
    app.include_router(consult_router.router, prefix=api)
    app.include_router(tickets_router.router, prefix=api)
    app.include_router(contacts_router.router, prefix=api)
    app.include_router(media_router.router, prefix=api)
    app.include_router(ai_router.router, prefix=api)
    app.include_router(account_router.auth_router, prefix=api)
    app.include_router(account_router.router, prefix=api)
    app.include_router(referrals_router.router, prefix=api)

    admin = f"{api}/admin"
    app.include_router(admin_dashboard.router, prefix=admin)
    app.include_router(admin_settings.router, prefix=admin)
    app.include_router(admin_pages.router, prefix=admin)
    app.include_router(admin_lawyers.router, prefix=admin)
    app.include_router(admin_media.router, prefix=admin)
    app.include_router(admin_consultations.router, prefix=admin)
    app.include_router(admin_tickets.router, prefix=admin)
    app.include_router(admin_contacts.router, prefix=admin)
    app.include_router(admin_requests.router, prefix=admin)
    app.include_router(admin_labels.router, prefix=admin)
    app.include_router(admin_articles.router, prefix=admin)
    app.include_router(admin_users.router, prefix=admin)
    app.include_router(admin_ai.router, prefix=admin)
    app.include_router(admin_audit.router, prefix=admin)
    app.include_router(admin_marketers.router, prefix=admin)
    app.include_router(admin_marketers.payouts_router, prefix=admin)
    app.include_router(admin_marketers.commissions_router, prefix=admin)

    return app


app = create_app()
