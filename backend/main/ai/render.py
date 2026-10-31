"""Render structured CMS/knowledge payloads as readable Persian text.

Knowledge bodies used to embed raw ``json.dumps`` blobs (``[key] {json}``)
which leaked straight into user-facing replies. Everything that can reach a
human — retrieval fallback, stored messages, knowledge rows — goes through
``sanitize_display_text`` so no JSON keys or markers are ever shown.
"""

import json
import re

# Persian label for keys we know; unknown keys are dropped — values only.
_KEY_FA = {
    "title": "عنوان",
    "lead": "مقدمه",
    "subtitle": "زیرعنوان",
    "tagline": "شعار",
    "description": "توضیحات",
    "text": "متن",
    "note": "یادداشت",
    "items": "",
    "paragraphs": "",
    "steps": "",
    "faqs": "",
    "question": "سؤال",
    "answer": "پاسخ",
    "name": "نام",
    "role": "سمت",
    "bio": "بیوگرافی",
    "cta": "دکمه",
    "label": "برچسب",
    "url": "نشانی",
    "membersTitle": "عنوان اعضا",
    "trustTitle": "عنوان اعتماد",
    "cardCta": "دعوت",
    "directLine": "خط مستقیم",
    "phones": "تلفن‌ها",
    "whatsapp": "واتس‌اپ",
    "email": "ایمیل",
    "address": "آدرس",
    "hours": "ساعات کاری",
    "socials": "شبکه‌های اجتماعی",
}

# legacy stored format: `[section_key] {json}` per line
_SECTION_LINE = re.compile(r"^\[[a-zA-Z0-9_.-]+\]\s*([{\[].*[}\]])\s*$")
# anything that still looks like a raw JSON blob on its own line
_JSON_LINE = re.compile(r"^\s*[\[{]")


def _scalar(v) -> str:
    if isinstance(v, bool):
        return "بله" if v else "خیر"
    return str(v).strip()


def content_to_lines(value, indent: int = 0) -> list[str]:
    """Flatten dict/list/str content to human-readable Persian lines."""
    pad = "  " * indent
    out: list[str] = []
    if value is None:
        return out
    if isinstance(value, str | int | float | bool):
        s = _scalar(value)
        if s:
            out.append(f"{pad}{s}")
        return out
    if isinstance(value, list):
        for item in value:
            if isinstance(item, str | int | float | bool):
                s = _scalar(item)
                if s:
                    out.append(f"{pad}• {s}")
            else:
                out.extend(content_to_lines(item, indent))
        return out
    if isinstance(value, dict):
        # standalone text fields first — they read as paragraphs
        for key in (
            "title",
            "lead",
            "subtitle",
            "tagline",
            "description",
            "text",
            "note",
        ):
            v = value.get(key)
            if isinstance(v, str) and v.strip():
                out.append(f"{pad}{v.strip()}")
        for key, v in value.items():
            if key in (
                "title",
                "lead",
                "subtitle",
                "tagline",
                "description",
                "text",
                "note",
            ):
                continue
            if isinstance(v, list):
                out.extend(content_to_lines(v, indent))
            elif isinstance(v, dict):
                label = _KEY_FA.get(key) or (
                    key if isinstance(key, str) and not key.isascii() else ""
                )
                if label:
                    out.append(f"{pad}{label}:")
                out.extend(content_to_lines(v, indent + 1))
            elif isinstance(v, str | int | float | bool):
                s = _scalar(v)
                if not s:
                    continue
                label = _KEY_FA.get(key) or (
                    key if isinstance(key, str) and not key.isascii() else ""
                )
                out.append(f"{pad}{label}: {s}" if label else f"{pad}{s}")
        return out
    return out


def content_to_text(value) -> str:
    return "\n".join(content_to_lines(value)).strip()


def stored_body_to_text(raw: str) -> str:
    """Convert a stored body — possibly containing `[key] {json}` blobs —
    into clean readable text. Unparseable JSON-looking lines are dropped."""
    out: list[str] = []
    for line in (raw or "").splitlines():
        line = line.rstrip()
        if not line.strip():
            if out and out[-1] != "":
                out.append("")
            continue
        m = _SECTION_LINE.match(line.strip())
        blob = m.group(1) if m else (line.strip() if _JSON_LINE.match(line) else None)
        if blob is None:
            out.append(line)
            continue
        try:
            parsed = json.loads(blob)
        except (ValueError, TypeError):
            continue  # drop corrupt JSON rather than leak it
        out.extend(content_to_lines(parsed))
    text = "\n".join(out)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def sanitize_display_text(text: str) -> str:
    """Guarantee a message/reply shown to users or admins has no raw JSON."""
    if not text:
        return text or ""
    if "{" not in text and "[" not in text:
        return text
    return stored_body_to_text(text)
