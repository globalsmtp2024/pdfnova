from collections.abc import Awaitable, Callable

import structlog
from fastapi import Request, Response
from fastapi.responses import JSONResponse

from app.core.config import Settings
from app.core.security import constant_time_equals, generate_token
from app.db.base import new_id

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})
AUTH_COOKIES = ("pn_access", "pn_refresh", "pn_anon")
CSRF_COOKIE = "pn_csrf"
CSRF_HEADER = "x-csrf-token"
CSRF_TTL_SECONDS = 60 * 60 * 24 * 30

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
DOCS_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "frame-ancestors 'none'"
)

Handler = Callable[[Request], Awaitable[Response]]


def build_http_middleware(settings: Settings) -> Callable[[Request, Handler], Awaitable[Response]]:
    async def middleware(request: Request, call_next: Handler) -> Response:
        request_id = request.headers.get("x-request-id") or new_id()
        structlog.contextvars.bind_contextvars(request_id=request_id[:64])
        try:
            rejection = _check_csrf(request)
            response = rejection or await call_next(request)
            _apply_security_headers(request, response, settings)
            response.headers["X-Request-ID"] = request_id[:64]
            if CSRF_COOKIE not in request.cookies:
                response.set_cookie(
                    CSRF_COOKIE,
                    generate_token(24),
                    max_age=CSRF_TTL_SECONDS,
                    httponly=False,
                    secure=settings.cookie_secure,
                    samesite="lax",
                    domain=settings.cookie_domain,
                    path="/",
                )
            return response
        finally:
            structlog.contextvars.clear_contextvars()

    return middleware


def _check_csrf(request: Request) -> Response | None:
    if request.method in SAFE_METHODS:
        return None
    if request.headers.get("authorization", "").lower().startswith("bearer "):
        return None
    if not any(name in request.cookies for name in AUTH_COOKIES):
        return None
    cookie_value = request.cookies.get(CSRF_COOKIE, "")
    header_value = request.headers.get(CSRF_HEADER, "")
    if cookie_value and header_value and constant_time_equals(cookie_value, header_value):
        return None
    return JSONResponse(
        status_code=403,
        content={
            "error": {
                "code": "csrf_failed",
                "message": "This request could not be verified.",
                "hint": "Refresh the page and try again.",
                "details": {},
            }
        },
    )


def _apply_security_headers(request: Request, response: Response, settings: Settings) -> None:
    headers = response.headers
    is_docs = request.url.path in {"/docs", "/redoc"}
    headers.setdefault("Content-Security-Policy", DOCS_CSP if is_docs else API_CSP)
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if settings.cookie_secure:
        headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
    if request.url.path.startswith("/api/") and "cache-control" not in headers:
        headers["Cache-Control"] = "no-store"
