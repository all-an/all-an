"""Courtesy throttles for signup and login, backed by the auth_events table.

These slow a casual attacker down; they are not an audit log and not a defence against a
determined one - an attacker with many addresses sidesteps a per-address cap by definition.
"""

import math

from .. import db
from ..errors import ApiError

MAX_SIGNUPS_PER_DAY = 3
MAX_LOGIN_FAILURES = 5
LOGIN_WINDOW_MINUTES = 15


def record(kind: str, ip: str, username: str | None = None) -> None:
    db.execute(
        "INSERT INTO auth_events (ip, username, kind) VALUES (%s, %s, %s)", (ip, username, kind)
    )


def assert_signup_allowed(ip: str) -> None:
    row = db.query_one(
        """
        SELECT COUNT(*) AS n FROM auth_events
        WHERE ip = %s AND kind = 'SIGNUP' AND created_at >= NOW() - INTERVAL '1 day'
        """,
        (ip,),
    )

    if row["n"] >= MAX_SIGNUPS_PER_DAY:
        raise ApiError.too_many_requests("Too many accounts have been created from this address today.")


def assert_login_allowed(ip: str) -> None:
    """Five failures in fifteen minutes locks the address out until the oldest of them ages out of
    the window - and says how long that is, so a legitimate user who fat-fingered it knows when to
    come back rather than guessing."""
    row = db.query_one(
        """
        SELECT COUNT(*) AS n,
               EXTRACT(EPOCH FROM (MIN(created_at) + make_interval(mins => %(mins)s) - NOW()))
                 AS retry_after
        FROM auth_events
        WHERE ip = %(ip)s AND kind = 'LOGIN_FAILURE'
          AND created_at >= NOW() - make_interval(mins => %(mins)s)
        """,
        {"ip": ip, "mins": LOGIN_WINDOW_MINUTES},
    )

    if row["n"] < MAX_LOGIN_FAILURES:
        return

    seconds = 1 if row["retry_after"] is None else max(1, math.ceil(float(row["retry_after"])))

    raise ApiError.too_many_requests(
        "Too many failed sign-ins from this address. Try again shortly.", retryAfterSeconds=seconds
    )


def clear_login_failures(ip: str) -> None:
    """A successful sign-in forgives the address's earlier failures."""
    db.execute("DELETE FROM auth_events WHERE ip = %s AND kind = 'LOGIN_FAILURE'", (ip,))
