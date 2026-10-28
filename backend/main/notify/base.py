"""Provider interface + shared send result."""

from dataclasses import dataclass
from typing import Protocol


@dataclass
class SendResult:
    ok: bool
    error: str = ""


class Provider(Protocol):
    name: str

    async def send_email(self, *, to: str, subject: str, body: str) -> SendResult: ...

    async def send_sms(self, *, to: str, body: str) -> SendResult: ...
