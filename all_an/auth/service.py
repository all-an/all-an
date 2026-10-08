"""Registering and signing in. Shared by the pages and the JSON API, which differ only in how they
read the request and what they send back."""

import os

from .. import settings, users
from ..errors import ApiError
from ..validate import Fields, is_email, password_checks, username_checks
from . import passwords, throttle

_unknown_user_hash: str | None = None


def _dummy_hash() -> str:
    """Checked against when the username does not exist, so "no such user" and "wrong password"
    take the same time. Without it, response latency would tell an attacker which usernames are real."""
    global _unknown_user_hash

    if _unknown_user_hash is None:
        _unknown_user_hash = passwords.hash_password(os.urandom(32).hex())

    return _unknown_user_hash


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
    }


def register(username: str, email: str, password: str, ip: str) -> dict:
    username, email = (username or "").strip(), (email or "").strip()
    password = password or ""

    fields = Fields()
    username_checks(fields, username)
    fields.check("email", is_email(email), "email is not a valid address")
    fields.check("email", len(email) <= 254, "email must be at most 254 characters")
    password_checks(fields, password)
    fields.finish()

    settings.assert_registration_open()
    throttle.assert_signup_allowed(ip)

    if users.find_by_username(username):
        raise ApiError.conflict("That username is taken.")

    if users.find_by_email(email):
        raise ApiError.conflict("That email address already has an account.")

    user = users.insert(username, email, passwords.hash_password(password))
    throttle.record("SIGNUP", ip, username)

    return user


def authenticate(username: str, password: str, ip: str) -> dict:
    username, password = (username or "").strip(), password or ""

    fields = Fields()
    username_checks(fields, username)
    password_checks(fields, password)
    fields.finish()

    throttle.assert_login_allowed(ip)

    user = users.find_by_username(username)
    matches = passwords.verify_password(password, user["password_hash"] if user else _dummy_hash())

    if not user or not matches:
        throttle.record("LOGIN_FAILURE", ip, username)
        # One message for both failures: it must not reveal which half was wrong.
        raise ApiError.unauthorized("That username and password do not match.")

    throttle.clear_login_failures(ip)
    return user
