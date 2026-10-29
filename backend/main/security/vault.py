"""Symmetric encryption for sensitive-at-rest fields (IBAN, card numbers).

Key is derived from SECRET_KEY — rotating the secret invalidates stored
ciphertexts (acceptable: bank coordinates can be re-entered).
"""

import base64
import hashlib
import hmac

from cryptography.fernet import Fernet

from ..core.config import get_settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(
        hmac.new(b"dadnovin-vault", get_settings().secret_key.encode(), hashlib.sha256)
        .digest()
    ).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_field(plain: str) -> str:
    if not plain:
        return ""
    return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_field(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except Exception:
        return ""


def mask_digits(raw: str, keep: int = 4) -> str:
    """'6037991234567890' → '••••7890' — for UI-safe display."""
    digits = "".join(ch for ch in raw if ch.isdigit())
    return "••••" + digits[-keep:] if len(digits) > keep else digits
