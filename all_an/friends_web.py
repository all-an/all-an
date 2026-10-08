"""Friends: the JSON API and the page. The page is one body region (#friends-body) that every
button re-renders, with the result of the action on top."""

from flask import Blueprint, jsonify, render_template, request

from . import friends
from .auth.guards import login_required
from .auth.sessions import current_user
from .errors import ApiError
from .validate import Fields

api = Blueprint("friends_api", __name__, url_prefix="/api/friends")
pages = Blueprint("friends_pages", __name__)


def _json() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError.bad_request("That request was not valid.")
    return body


def _username(raw) -> str:
    username = (raw or "").strip() if isinstance(raw, str) else ""

    fields = Fields()
    fields.check("username", bool(username), "username is required")
    fields.check("username", len(username) <= 64, "username must be at most 64 characters")
    fields.finish()

    return username


# --- JSON API ----------------------------------------------------------------------------------


@api.get("")
@login_required
def list_friends():
    return jsonify(friends.list_friends(current_user()))


@api.get("/requests")
@login_required
def list_requests():
    return jsonify(friends.list_requests(current_user()))


@api.post("/requests")
@login_required
def request_friend():
    status = friends.request_friend(current_user(), _username(_json().get("username")))
    return jsonify({"status": status}), 201


@api.post("/requests/<int:friendship_id>/accept")
@login_required
def accept(friendship_id):
    friends.accept_request(friendship_id, current_user())
    return "", 204


@api.delete("/requests/<int:friendship_id>")
@login_required
def remove_request(friendship_id):
    friends.remove_request(friendship_id, current_user())
    return "", 204


@api.delete("/<int:friendship_id>")
@login_required
def unfriend(friendship_id):
    friends.unfriend(friendship_id, current_user())
    return "", 204


# --- the page ----------------------------------------------------------------------------------


def _body(*, notice: str = "", error: str = "", username: str = "", status: int = 200):
    user = current_user()
    requests = friends.list_requests(user)

    return (
        render_template(
            "partials/friends_body.html",
            friends=friends.list_friends(user),
            incoming=[r for r in requests if r["direction"] == "INCOMING"],
            outgoing=[r for r in requests if r["direction"] == "OUTGOING"],
            notice=notice,
            error=error,
            username=username,
        ),
        status,
    )


@pages.get("/friends")
@login_required
def friends_page():
    body, _ = _body()
    return render_template("friends.html", active="friends", body=body)


@pages.post("/friends/requests")
@login_required
def add():
    username = (request.form.get("username") or "").strip()

    if not username:
        return _body()

    try:
        status = friends.request_friend(current_user(), _username(username))
    except ApiError as error:
        if error.status >= 500:
            raise
        # Where the person is looking: under the form they just used, with what they typed kept.
        return _body(error=" ".join((error.details.get("fields") or {}).values()) or error.message,
                     username=username, status=422)

    return _body(
        notice=(
            f"You and {username} are now friends - they had already asked you."
            if status == "ACCEPTED"
            else f"Request sent to {username}."
        )
    )


@pages.post("/friends/requests/<int:friendship_id>/<action>")
@login_required
def request_action(friendship_id, action):
    if action == "accept":
        friends.accept_request(friendship_id, current_user())
    elif action == "remove":
        friends.remove_request(friendship_id, current_user())
    else:
        raise ApiError.not_found()

    return _body()


@pages.post("/friends/<int:friendship_id>/remove")
@login_required
def remove_friend(friendship_id):
    friends.unfriend(friendship_id, current_user())
    return _body()
