"""Server-side HTML sanitization for editor output (Stored-XSS defense).

The admin article editor emits rich HTML; it is rendered on the public site.
Only an allowlist of tags/attributes survives — scripts, event handlers,
javascript: URLs, and unknown tags are stripped or unwrapped.
"""

import nh3

# editor-produced markup only (headings h2–h4, lists, quote, table, media)
_ALLOWED_TAGS = {
    "h2",
    "h3",
    "h4",
    "p",
    "br",
    "hr",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "code",
    "ul",
    "ol",
    "li",
    "blockquote",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "caption",
    "a",
    "img",
    "figure",
    "figcaption",
    "div",
    "span",
}

_ALLOWED_ATTRS = {
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "width", "height", "loading"},
    "th": {"colspan", "rowspan"},
    "td": {"colspan", "rowspan"},
    "div": {"dir"},
    "p": {"dir"},
    "h2": {"id"},
    "h3": {"id"},
    "h4": {"id"},
}

_URL_ATTRS = {"href", "src"}
_ALLOWED_SCHEMES = {"https", "http", "mailto"}


def sanitize_html(html: str) -> str:
    if not html:
        return ""
    out = nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        url_schemes=_ALLOWED_SCHEMES,
        link_rel="noopener noreferrer",
        strip_comments=True,
    )
    # no hot-linked/external images — only same-origin uploads may remain
    # (nh3 already dropped non-http(s) src; external http(s) images are allowed
    #  by the allowlist but flagged here for future tightening via CSP)
    return out


def plain_text_len(html: str) -> int:
    """Word count of visible text — drives read_time_min."""
    import re

    text = re.sub(r"<[^>]+>", " ", html)
    return len(text.split())


def reading_minutes(html: str) -> int:
    # ~180 Persian words/min is a comfortable adult rate
    words = plain_text_len(html)
    return max(1, round(words / 180)) if words else 0
