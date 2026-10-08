from functools import wraps

from flask import make_response, redirect, request

from ..errors import ApiError, wants_json
from ..web import is_htmx, sign_in_url
from .sessions import current_user


def _redirect(url: str):
    """HTMX would follow a 303 and swap the destination page into the element that asked, so for
    HTMX the instruction to navigate goes in a header instead."""
    if is_htmx():
        response = make_response("", 204)
        response.headers["HX-Redirect"] = url
        return response

    return redirect(url, 303)


def _to_sign_in():
    target = request.full_path.rstrip("?") if request.method == "GET" else request.referrer or "/"
    return _redirect(sign_in_url(target))


def login_required(view):
    """Signed-in users only. The API says 401; a page sends you to sign in and back afterwards."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            if wants_json():
                raise ApiError.unauthorized()
            return _to_sign_in()

        return view(*args, **kwargs)

    return wrapper


def admin_required(view):
    """Administrators only. A signed-in non-admin goes home; a stranger goes to sign in."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()

        if user is None:
            if wants_json():
                raise ApiError.unauthorized()
            return _to_sign_in()

        if user["role"] != "ADMIN":
            if wants_json():
                raise ApiError.forbidden("That needs an administrator.")
            return _redirect("/")

        return view(*args, **kwargs)

    return wrapper
