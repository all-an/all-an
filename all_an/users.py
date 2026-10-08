import logging

from . import db
from .auth import passwords

log = logging.getLogger(__name__)

_COLUMNS = "id, username, email, password_hash, role"


def find_by_username(username: str) -> dict | None:
    return db.query_one(
        f"SELECT {_COLUMNS} FROM users WHERE LOWER(username) = LOWER(%s)", (username,)
    )


def find_by_email(email: str) -> dict | None:
    return db.query_one(f"SELECT {_COLUMNS} FROM users WHERE LOWER(email) = LOWER(%s)", (email,))


def find_by_ids(ids: list[int]) -> list[dict]:
    if not ids:
        return []

    return db.query(f"SELECT {_COLUMNS} FROM users WHERE id = ANY(%s)", (ids,))


def insert(username: str, email: str, password_hash: str, role: str = "USER") -> dict:
    return db.query_one(
        f"""
        INSERT INTO users (username, email, password_hash, role)
        VALUES (%s, %s, %s, %s)
        RETURNING {_COLUMNS}
        """,
        (username, email, password_hash, role),
    )


def bootstrap_admin(config) -> None:
    """Creates the administrator named in the environment, if there is one and it does not exist.

    The credential lives in the environment rather than a migration so it never lands in version
    control. Safe on every start: an existing account is left as it is, so changing ADMIN_PASSWORD
    later does not rotate the password - do that from the app.
    """
    if not (config.admin_username and config.admin_password):
        return

    if not config.admin_email:
        log.warning("ADMIN_USERNAME is set but ADMIN_EMAIL is not; skipping admin creation.")
        return

    if find_by_username(config.admin_username):
        return

    insert(config.admin_username, config.admin_email, passwords.hash_password(config.admin_password), "ADMIN")
    log.info('Created administrator "%s".', config.admin_username)
