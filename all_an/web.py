"""Small helpers for talking to HTMX and to browsers that have no JavaScript."""

from urllib.parse import quote

from flask import make_response, redirect, request


def is_htmx() -> bool:
    return request.headers.get("HX-Request") == "true"


def go(url: str):
    """Send the browser to `url` after a successful form post.

    HTMX follows a redirect by swapping the target page in; what we want is a real navigation, so
    for HTMX requests the instruction goes in HX-Redirect. A browser without JavaScript posted the
    form natively and gets an ordinary redirect.
    """
    if is_htmx():
        response = make_response("", 204)
        response.headers["HX-Redirect"] = url
        return response

    return redirect(url, 303)


def safe_next(value: str | None, default: str = "/quizzes") -> str:
    """Only same-site paths: `next` comes from the address bar, and an open redirect is a phishing aid."""
    if value and value.startswith("/") and not value.startswith("//") and "\\" not in value:
        return value

    return default


def sign_in_url(target: str) -> str:
    return f"/login?next={quote(target, safe='/')}"
