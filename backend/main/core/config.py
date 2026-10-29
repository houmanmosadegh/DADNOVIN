"""Application settings — every value comes from the environment."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    environment: str = "development"
    database_url: str = (
        "postgresql+asyncpg://dadnovin:dadnovin@localhost:5432/dadnovin"
    )

    # session cookie — signed random value; REQUIRED in production
    secret_key: str = "dev-only-insecure-secret-change-me"
    session_cookie_name: str = "dadnovin_session"
    session_ttl_hours: int = 12
    session_idle_minutes: int = 60
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # comma-separated list of origins allowed to call the API
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:8080"

    # absolute site origin — referral links / QR codes embed this
    public_base_url: str = "http://localhost:8080"

    # media
    storage_dir: str = "storage"
    media_max_bytes: int = 6 * 1024 * 1024  # 6 MB
    media_max_pixels: int = 4000  # clamp the long edge

    # rate limiting (in-memory per worker — enough for a single-node deploy)
    rate_limit_per_minute: int = 120
    rate_limit_login_per_minute: int = 8
    rate_limit_public_post_per_minute: int = 10
    rate_limit_ai_per_minute: int = 15

    # OpenAPI docs — disable in production
    expose_docs: bool = True

    # AI provider — OpenAI-compatible chat-completions endpoint.
    # Empty api key ⇒ assistant runs in retrieval-only "unavailable" mode.
    ai_base_url: str = "https://api.openai.com/v1"
    ai_api_key: str = ""
    ai_model: str = "gpt-4o-mini"
    ai_enabled: bool = True
    ai_timeout_seconds: float = 20.0
    ai_max_reply_chars: int = 1800

    # outbound notifications — mock|smtp|sms_http provider for customer replies
    notify_provider: str = "mock"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    sms_url: str = ""
    sms_token: str = ""
    sms_sender: str = ""
    # hours without a first staff response before a request is flagged overdue
    request_sla_hours: int = 24

    # seed/bootstrap
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""
    bootstrap_admin_name: str = "مدیر مجموعه"

    @field_validator("cookie_samesite")
    @classmethod
    def _samesite(cls, v: str) -> str:
        v = v.lower()
        if v not in {"lax", "strict", "none"}:
            raise ValueError("cookie_samesite must be lax|strict|none")
        return v

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def ai_configured(self) -> bool:
        return self.ai_enabled and bool(self.ai_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def validate_production_settings(settings: Settings) -> None:
    """Fail fast on dangerous production defaults instead of silently shipping them."""
    if not settings.is_production:
        return
    problems: list[str] = []
    if settings.secret_key == "dev-only-insecure-secret-change-me":
        problems.append("SECRET_KEY is still the development default")
    if not settings.cookie_secure:
        problems.append("COOKIE_SECURE must be true behind HTTPS in production")
    if "*" in settings.cors_origin_list:
        problems.append("CORS_ORIGINS must not contain '*' in production")
    if problems:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))
