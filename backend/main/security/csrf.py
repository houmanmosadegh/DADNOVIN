"""CSRF guard for cookie-authenticated mutations.

Session cookies are SameSite=Lax, which already blocks cross-site POSTs
in modern browsers. Defense in depth: for state-changing requests we
additionally require either the `X-Requested-With` header our own clients
send, or an Origin/Referer host matching the request host.

Returns an error detail dict (or None) — middleware turns it into a 403
JSONResponse because HTTPException can't be raised inside middleware.
"""

from urllib.parse import urlparse

from ..core.config import get_settings

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CUSTOM_HEADER = "x-requested-with"

CSRF_ERROR = {"code": "csrf", "message": "درخواست نامعتبر است."}


def csrf_violation(request) -> dict | None:
    if request.method in SAFE_METHODS:
        return None
    if request.headers.get(CUSTOM_HEADER) == "fetch":
        return None
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin:
        # browsers always send Origin on cross-site posts; an absent header
        # means same-site navigation or a non-browser client
        return None
    parsed = urlparse(origin)
    origin_host = parsed.hostname or ""
    request_host = (request.headers.get("host") or "").split(":")[0]
    if request_host and origin_host == request_host:
        return None
    # panel/frontend may live on a different origin — allow CORS-blessed ones
    allowed = {urlparse(o).hostname for o in get_settings().cors_origin_list}
    if origin_host in allowed:
        return None
    return CSRF_ERROR
