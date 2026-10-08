"""Request validation: collect the first problem per field, then fail once with all of them."""

import re

from .errors import ApiError


class Fields:
    """First-wins per field: the second complaint about a field is usually the same mistake again."""

    def __init__(self):
        self._problems: dict[str, str] = {}

    def check(self, field: str, ok: bool, message: str) -> None:
        if not ok:
            self._problems.setdefault(field, message)

    def finish(self) -> None:
        if self._problems:
            raise ApiError.invalid_fields(self._problems)


_USERNAME = re.compile(r"^[A-Za-z0-9_-]+$")


def is_email(value: str) -> bool:
    local, at, domain = value.partition("@")

    return bool(
        at
        and local
        and not any(c.isspace() for c in value)
        and "@" not in domain
        and "." in domain
        and not domain.startswith(".")
        and not domain.endswith(".")
    )


def username_checks(fields: Fields, username: str) -> None:
    fields.check("username", len(username) >= 3, "username must be at least 3 characters")
    fields.check("username", len(username) <= 64, "username must be at most 64 characters")
    fields.check(
        "username",
        bool(_USERNAME.match(username)),
        "username may only contain letters, numbers, _ and -",
    )


def password_checks(fields: Fields, password: str) -> None:
    fields.check("password", len(password) >= 8, "password must be at least 8 characters")
    fields.check("password", len(password) <= 200, "password must be at most 200 characters")
