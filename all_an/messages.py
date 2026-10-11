"""The contact form: one message a day per address."""

from datetime import UTC, datetime

from . import db
from .errors import ApiError
from .util import iso
from .validate import Fields, is_email

CONTACT_EMAIL = "allan6tech@gmail.com"


def start_of_today_utc(now: datetime | None = None) -> datetime:
    """Midnight UTC today. The limit is "one a day" on the calendar rather than "one per 24
    hours", so somebody who wrote at 23:50 can write again at 00:10 - which is what "tomorrow"
    means to a person."""
    now = now or datetime.now(UTC)
    return now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


def _blank_to_none(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def validate(name: str | None, email: str | None, body: str | None) -> tuple[str | None, str | None, str]:
    name, email, body = name or "", (email or "").strip(), (body or "").strip()

    fields = Fields()
    fields.check("name", len(name) <= 80, "name must be at most 80 characters")
    fields.check("email", not email or is_email(email), "email is not a valid address")
    fields.check("email", len(email) <= 254, "email must be at most 254 characters")
    fields.check("body", bool(body), "message is required")
    fields.check("body", len(body) <= 5000, "message must be at most 5000 characters")
    fields.finish()

    return _blank_to_none(name), _blank_to_none(email), body


def send(ip: str, name: str | None, email: str | None, body: str | None) -> dict:
    name, email, body = validate(name, email, body)

    posted_today = db.query_one(
        "SELECT EXISTS (SELECT 1 FROM messages WHERE ip = %s AND created_at >= %s) AS e",
        (ip, start_of_today_utc()),
    )["e"]

    if posted_today:
        raise ApiError.too_many_requests(
            "This address has already sent a message today.", contactEmail=CONTACT_EMAIL
        )

    row = db.query_one(
        """
        INSERT INTO messages (ip, name, email, body, created_at) VALUES (%s, %s, %s, %s, NOW())
        RETURNING id, created_at
        """,
        (ip, name, email, body),
    )
    return {"id": row["id"], "createdAt": iso(row["created_at"])}
