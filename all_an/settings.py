"""Site-wide switches an administrator can flip, kept in app_settings."""

import logging

from . import db
from .errors import ApiError

log = logging.getLogger(__name__)

REGISTRATION_ENABLED = "registration_enabled"
DEFAULTS = {"registrationEnabled": True}


def _read_bool(value: str | None, fallback: bool) -> bool:
    """A value nobody can read falls back to the default rather than failing the request: a typo
    in the table should not take the sign-in page down."""
    if value is None:
        return fallback
    if value in ("true", "false"):
        return value == "true"

    log.warning("Ignoring unreadable app_settings value %r; using %s.", value, fallback)
    return fallback


def read() -> dict:
    rows = {row["key"]: row["value"] for row in db.query("SELECT key, value FROM app_settings")}

    return {
        "registrationEnabled": _read_bool(
            rows.get(REGISTRATION_ENABLED), DEFAULTS["registrationEnabled"]
        )
    }


def write(settings: dict, admin_id: int) -> dict:
    db.execute(
        """
        INSERT INTO app_settings (key, value, updated_at, updated_by)
        VALUES (%s, %s, NOW(), %s)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
        """,
        (REGISTRATION_ENABLED, "true" if settings["registrationEnabled"] else "false", admin_id),
    )
    return settings


def assert_registration_open() -> None:
    if not read()["registrationEnabled"]:
        raise ApiError.forbidden("Registration is closed at the moment.")
