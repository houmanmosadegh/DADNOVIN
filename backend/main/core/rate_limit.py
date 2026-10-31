"""In-memory sliding-window rate limiter.

Single-node deployments need no external store — buckets live in process.
On multi-worker setups each worker enforces its own quota, which still
bounds abuse; tighten `rate_limit_*` settings if you scale out.
"""

import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def check(self, bucket: str, key: str, limit: int, window_s: int = 60) -> None:
        now = time.monotonic()
        q = self._hits[(bucket, key)]
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "rate_limited",
                    "message": "تعداد درخواست‌ها بیش از حد است؛ کمی بعد دوباره تلاش کنید.",
                },
            )
        q.append(now)


limiter = RateLimiter()


def client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(
    bucket: str, limit_getter: Callable[[], int]
) -> Callable[[Request], None]:
    """Dependency factory — usage: dependencies=[rate_limit('login', lambda: s.rate_limit_login_per_minute)]."""

    def _dep(request: Request) -> None:
        limiter.check(bucket, client_key(request), limit_getter())

    return _dep
