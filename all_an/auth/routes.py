from flask import Blueprint, jsonify, make_response, render_template, request

from .. import settings
from ..errors import ApiError
from ..messages import CONTACT_EMAIL
from ..security import client_ip
from ..web import go, is_htmx, safe_next
from . import service
from .guards import login_required
from .sessions import current_user, end_session, start_session

pages = Blueprint("auth_pages", __name__)
api = Blueprint("auth_api", __name__, url_prefix="/api/auth")


# --- pages -----------------------------------------------------------------------------------------


def _form_page(kind: str, status: int = 200, **context):
    """The whole page, or - for an HTMX post that failed - just the form, with its errors."""
    template = f"partials/{kind}_form.html" if is_htmx() and status != 200 else f"{kind}.html"

    context.setdefault("contact_email", CONTACT_EMAIL)
    context.setdefault("registration_open", settings.read()["registrationEnabled"])
    context.setdefault("fields", {})
    context.setdefault("values", {})
    context.setdefault("form_error", "")
    context.setdefault("next", safe_next(request.args.get("next") or request.form.get("next"), ""))

    return render_template(template, **context), status


@pages.get("/login")
def login_page():
    return _form_page("login")


@pages.get("/register")
def register_page():
    return _form_page("register")


def _failed(kind: str, error: ApiError):
    values = {key: value for key, value in request.form.items() if key != "password"}
    form_error = "" if error.status == 400 and "fields" in error.details else error.message

    return _form_page(
        kind, status=422, fields=error.details.get("fields", {}), values=values, form_error=form_error
    )


@pages.post("/login")
def login_submit():
    try:
        user = service.authenticate(
            request.form.get("username", ""), request.form.get("password", ""), client_ip()
        )
    except ApiError as error:
        return _failed("login", error)

    response = go(safe_next(request.form.get("next")))
    return start_session(response, user["id"])


@pages.post("/register")
def register_submit():
    try:
        user = service.register(
            request.form.get("username", ""),
            request.form.get("email", ""),
            request.form.get("password", ""),
            client_ip(),
        )
    except ApiError as error:
        return _failed("register", error)

    response = go(safe_next(request.form.get("next")))
    return start_session(response, user["id"])


@pages.post("/logout")
def logout():
    return end_session(go("/"))


# --- JSON API --------------------------------------------------------------------------------------


def _json_body() -> dict:
    body = request.get_json(silent=True)

    if not isinstance(body, dict):
        raise ApiError.bad_request("That request was not valid.")

    return body


def _str(body: dict, key: str) -> str:
    value = body.get(key, "")
    return value if isinstance(value, str) else ""


@api.post("/register")
def api_register():
    body = _json_body()
    user = service.register(_str(body, "username"), _str(body, "email"), _str(body, "password"), client_ip())

    response = make_response(jsonify(service.public_user(user)), 201)
    return start_session(response, user["id"])


@api.post("/login")
def api_login():
    body = _json_body()
    user = service.authenticate(_str(body, "username"), _str(body, "password"), client_ip())

    response = make_response(jsonify(service.public_user(user)))
    return start_session(response, user["id"])


@api.post("/logout")
def api_logout():
    return end_session(make_response("", 204))


@api.get("/me")
@login_required
def api_me():
    return jsonify(service.public_user(current_user()))
