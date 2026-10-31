"""Human-friendly identifiers."""

import secrets
import string


def access_code() -> str:
    """Short code customers keep to view their request — no enumeration."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


def tracking_code(jalali_year: int, seq: int) -> str:
    """Sequential public code — e.g. DN-1405-0042."""
    return f"DN-{jalali_year}-{seq:04d}"
