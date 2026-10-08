"""Opaque, revocable sessions.

The cookie holds 32 random bytes; the database holds their SHA-256. A leaked dump of the table
contains nothing anyone could present as a cookie, and deleting a row signs that browser out
immediately - which a self-contained signed token could not do. The same table the Node and Rust
versions used, so people who are signed in stay signed in across the cutover.
"""

import hashlib
import secrets

from flask import current_app, g, request

from .. import db

SESSION_COOKIE = "sid"
SESSION_TTL_DAYS = 30


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def start_session(response, user_id: int):
    """Creates the session row and sets the cookie on `response`. Returns the response."""
    token = secrets.token_urlsafe(32)

    db.execute(
        """
        INSERT INTO sessions (id, user_id, expires_at)
        VALUES (%s, %s, NOW() + make_interval(days => %s))
        """,
        (_token_hash(token), user_id, SESSION_TTL_DAYS),
    )

    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_DAYS * 24 * 60 * 60,
        httponly=True,
        samesite="Lax",
        secure=current_app.config["ALL_AN"].session_cookie_secure,
        path="/",
    )
    return response


def end_session(response):
    token = request.cookies.get(SESSION_COOKIE)

    if token:
        db.execute("DELETE FROM sessions WHERE id = %s", (_token_hash(token),))

    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


def current_user() -> dict | None:
    """The signed-in user, or None. Looked up once per request."""
    if "user" in g:
        return g.user

    token = request.cookies.get(SESSION_COOKIE)
    g.user = None

    if token:
        g.user = db.query_one(
            """
            SELECT u.id, u.username, u.email, u.role
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = %s AND s.expires_at > NOW()
            """,
            (_token_hash(token),),
        )

    return g.user


def sweep_expired() -> None:
    db.execute("DELETE FROM sessions WHERE expires_at <= NOW()")
