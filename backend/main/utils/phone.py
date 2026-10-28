"""Iranian phone normalization + validation.

Accepts Persian/Arabic digits and common separators; returns the canonical
0-prefixed form used across the site (+98 mobile → 09xx, landlines kept).
"""

FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"

_MOBILE = r"^09\d{9}$"
_LANDLINE = r"^0\d{10}$"


def normalize_phone(value: str) -> str:
    out = value.strip()
    for i, d in enumerate(FA_DIGITS):
        out = out.replace(d, str(i))
    for i, d in enumerate(AR_DIGITS):
        out = out.replace(d, str(i))
    out = out.replace(" ", "").replace("-", "").replace("‌", "")
    if out.startswith("+98"):
        out = "0" + out[3:]
    elif out.startswith("0098"):
        out = "0" + out[4:]
    elif out.startswith("98") and len(out) == 12:
        out = "0" + out[2:]
    return out


def is_valid_iranian_phone(value: str) -> bool:
    import re

    return bool(re.match(_MOBILE, value) or re.match(_LANDLINE, value))
