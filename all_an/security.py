"""CSRF protection and the client's address.

CSRF: the Rust version relied on SameSite=Lax and on only accepting JSON POSTs. HTMX posts HTML
forms, which a hostile page can submit, so every mutating request must now carry a token that only
our own pages can read. It is the double-submit pattern: a random token lives in a cookie, the same
value is rendered into the page, and the request must echo it in the `X-CSRF-Token` header (HTMX
adds it to every request) or in a `csrf_token` form field. A cross-site request carries the cookie
but cannot read it to copy the value.
"""

import hmac
import secrets

from flask import Flask, g, request

from .errors import ApiError

CSRF_COOKIE = "csrf"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
MAX_IP_LENGTH = 45  # The longest IPv6 text form, matching the columns that store it.


def client_ip() -> str:
    """The address the throttles attribute a request to.

    Behind a trusted proxy that is the LAST entry of X-Forwarded-For - the address the proxy itself
    saw connecting, which a client cannot forge because the proxy appends it. Earlier entries are
    whatever the client claimed. Without a trusted proxy the header is ignored entirely.
    """
    from flask import current_app

    ip = None

    if current_app.config["ALL_AN"].trust_proxy_headers:
        forwarded = request.headers.get("X-Forwarded-For", "")
        last = forwarded.rsplit(",", 1)[-1].strip()
        ip = last or None

    ip = ip or request.remote_addr or "unknown"

    # An IPv4 client on a dual-stack socket shows up as ::ffff:1.2.3.4; one address, one form.
    ip = ip.removeprefix("::ffff:")

    return ip[:MAX_IP_LENGTH]


def init_security(app: Flask) -> None:
    @app.before_request
    def csrf_guard():
        token = request.cookies.get(CSRF_COOKIE)
        g.csrf_cookie_missing = not token
        g.csrf_token = token or secrets.token_urlsafe(32)

        if request.method in _SAFE_METHODS:
            return

        supplied = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token") or ""

        if not token or not hmac.compare_digest(supplied, token):
            raise ApiError.forbidden(
                "Your session expired. Reload the page and try again."
            )

    @app.after_request
    def set_csrf_cookie(response):
        if getattr(g, "csrf_cookie_missing", False):
            response.set_cookie(
                CSRF_COOKIE,
                g.csrf_token,
                httponly=True,
                samesite="Lax",
                secure=app.config["ALL_AN"].session_cookie_secure,
                path="/",
            )
        return response

    @app.context_processor
    def inject_csrf():
        return {"csrf_token": getattr(g, "csrf_token", "")}
