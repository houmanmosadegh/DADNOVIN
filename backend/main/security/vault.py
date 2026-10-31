"""Symmetric encryption for sensitive-at-rest fields (IBAN, card numbers).

New writes use AES-256-GCM (`cryptography.hazmat.primitives.ciphers.aead.AESGCM`).
Key: `PAYOUT_ENC_KEY` env var when set, else derived from SECRET_KEY via
HKDF — rotating secrets invalidates stored ciphertexts (bank coordinates can
be re-entered). Legacy rows written with Fernet still decrypt transparently.
"""

import base64
import hashlib
import hmac
import os

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..core.config import get_settings

_GCM_PREFIX = "gcm:"


def _key() -> bytes:
    env_key = os.environ.get("PAYOUT_ENC_KEY", "").strip()
    if env_key:
        raw = hashlib.sha256(env_key.encode()).digest()
    else:
        raw = hmac.new(
            b"dadnovin-vault-gcm",
            get_settings().secret_key.encode(),
            hashlib.sha256,
        ).digest()
    return raw  # 32 bytes → AES-256


def encrypt_field(plain: str) -> str:
    """AES-256-GCM with a random 96-bit nonce — output 'gcm:<b64 nonce+ct>."""
    if not plain:
        return ""
    nonce = os.urandom(12)
    ct = AESGCM(_key()).encrypt(nonce, plain.encode("utf-8"), None)
    return _GCM_PREFIX + base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def _legacy_fernet() -> Fernet:
    digest = hashlib.sha256(
        hmac.new(
            b"dadnovin-vault", get_settings().secret_key.encode(), hashlib.sha256
        ).digest()
    ).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def decrypt_field(token: str) -> str:
    """Decrypt GCM values; transparent fallback for legacy Fernet rows."""
    if not token:
        return ""
    try:
        if token.startswith(_GCM_PREFIX):
            raw = base64.urlsafe_b64decode(token[len(_GCM_PREFIX) :].encode("ascii"))
            return AESGCM(_key()).decrypt(raw[:12], raw[12:], None).decode("utf-8")
        return _legacy_fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except Exception:
        return ""


def mask_digits(raw: str, keep: int = 4) -> str:
    """'6037991234567890' → '••••7890' — for UI-safe display."""
    digits = "".join(ch for ch in raw if ch.isdigit())
    return "••••" + digits[-keep:] if len(digits) > keep else digits


def mask_iban(raw: str) -> str:
    """'IR062960000000100324200001' → 'IR••••0001' — country prefix visible."""
    clean = "".join(ch for ch in raw if ch.isalnum()).upper()
    if len(clean) < 8:
        return mask_digits(clean)
    return f"{clean[:2]}••••{clean[-4:]}"


# ─── validation ─────────────────────────────────────────────────────


def luhn_ok(number: str) -> bool:
    digits = "".join(ch for ch in number if ch.isdigit())
    if len(digits) != 16:
        return False
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def iban_ok(iban: str) -> bool:
    """Iranian Sheba — 'IR' + 24 digits, ISO 13616 mod-97 checksum."""
    clean = "".join(ch for ch in iban if ch.isalnum()).upper()
    if len(clean) != 26 or not clean.startswith("IR"):
        return False
    rearranged = clean[4:] + clean[:4]
    numeric = "".join(str(int(ch, 36)) if ch.isalpha() else ch for ch in rearranged)
    try:
        return int(numeric) % 97 == 1
    except ValueError:
        return False


def normalize_iban(iban: str) -> str:
    return "".join(ch for ch in iban if ch.isalnum()).upper()


def normalize_card(card: str) -> str:
    return "".join(ch for ch in card if ch.isdigit())
