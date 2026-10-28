"""Concrete providers — mock (default), SMTP email, generic HTTP SMS gateway."""

import asyncio
import smtplib
from email.message import EmailMessage

import httpx

from ..core.config import get_settings
from .base import Provider, SendResult

settings = get_settings()


class MockProvider:
    """Records sends without any external side effects — dev/test default."""

    name = "mock"

    async def send_email(self, *, to: str, subject: str, body: str) -> SendResult:
        return SendResult(ok=True)

    async def send_sms(self, *, to: str, body: str) -> SendResult:
        return SendResult(ok=True)


class SmtpProvider:
    name = "smtp"

    def _send(self, *, to: str, subject: str, body: str) -> SendResult:
        msg = EmailMessage()
        msg["From"] = settings.smtp_from or settings.smtp_username
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                if settings.smtp_use_tls:
                    s.starttls()
                if settings.smtp_username:
                    s.login(settings.smtp_username, settings.smtp_password)
                s.send_message(msg)
            return SendResult(ok=True)
        except Exception as exc:  # network/auth errors become failed deliveries
            return SendResult(ok=False, error=str(exc)[:480])

    async def send_email(self, *, to: str, subject: str, body: str) -> SendResult:
        if not settings.smtp_host:
            return SendResult(ok=False, error="smtp not configured")
        return await asyncio.to_thread(self._send, to=to, subject=subject, body=body)

    async def send_sms(self, *, to: str, body: str) -> SendResult:
        return SendResult(ok=False, error="smtp provider has no sms channel")


class SmsHttpProvider:
    """Generic HTTP SMS gateway — POST {to, from, text} with a bearer token."""

    name = "sms_http"

    async def send_email(self, *, to: str, subject: str, body: str) -> SendResult:
        return SendResult(ok=False, error="sms provider has no email channel")

    async def send_sms(self, *, to: str, body: str) -> SendResult:
        if not settings.sms_url:
            return SendResult(ok=False, error="sms gateway not configured")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    settings.sms_url,
                    json={"to": to, "from": settings.sms_sender, "text": body},
                    headers={"Authorization": f"Bearer {settings.sms_token}"},
                )
            if r.status_code < 300:
                return SendResult(ok=True)
            return SendResult(ok=False, error=f"gateway {r.status_code}")
        except Exception as exc:
            return SendResult(ok=False, error=str(exc)[:480])


_REGISTRY: dict[str, Provider] = {
    "mock": MockProvider(),
    "smtp": SmtpProvider(),
    "sms_http": SmsHttpProvider(),
}


def get_provider() -> Provider:
    return _REGISTRY.get(settings.notify_provider, _REGISTRY["mock"])
