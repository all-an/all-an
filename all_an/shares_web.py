"""Sharing: the JSON API, the "Shared with me" page, and the share panel inside the editor."""

from flask import Blueprint, jsonify, render_template, request

from . import friends, shares
from .auth.guards import login_required
from .auth.sessions import current_user
from .errors import ApiError
from .quizzes import service as quizzes
from .util import to_int
from .validate import Fields

api = Blueprint("shares_api", __name__, url_prefix="/api")
pages = Blueprint("shares_pages", __name__)


def _json() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError.bad_request("That request was not valid.")
    return body


def _friend_ids(raw) -> list[int]:
    ids = [to_int(v) for v in raw] if isinstance(raw, list) else []

    fields = Fields()
    fields.check("friendIds", len(ids) >= 1, "choose at least one friend")
    fields.check("friendIds", len(ids) <= 50, "Too big: expected array to have <=50 items")
    fields.check("friendIds", all(i is not None for i in ids), "friendIds must be whole numbers")
    fields.finish()

    return ids


# --- JSON API ----------------------------------------------------------------------------------


@api.post("/quizzes/<int:quiz_id>/shares")
@login_required
def share_quiz(quiz_id):
    shared = shares.share_quiz(current_user(), quiz_id, _friend_ids(_json().get("friendIds")))
    return jsonify({"shared": shared}), 201


@api.post("/questions/<int:question_id>/shares")
@login_required
def share_question(question_id):
    shared = shares.share_question(current_user(), question_id, _friend_ids(_json().get("friendIds")))
    return jsonify({"shared": shared}), 201


@api.get("/shares")
@login_required
def list_shared():
    return jsonify(shares.list_shared(current_user()))


@api.post("/shares/questions/<int:share_id>/copy")
@login_required
def copy(share_id):
    quiz_id = to_int(_json().get("quizId"))

    if quiz_id is None:
        raise ApiError.bad_request_field("That request was not valid.", "quizId", "quizId must be a whole number")

    return jsonify({"questionId": shares.copy_shared_question(current_user(), share_id, quiz_id)}), 201


@api.delete("/shares/quizzes/<int:share_id>")
@login_required
def dismiss_quiz(share_id):
    shares.dismiss_quiz(current_user(), share_id)
    return "", 204


@api.delete("/shares/questions/<int:share_id>")
@login_required
def dismiss_question(share_id):
    shares.dismiss_question(current_user(), share_id)
    return "", 204


# --- the "Shared with me" page -----------------------------------------------------------------


def _shared_body(notice: str = "", error: str = ""):
    user = current_user()

    return render_template(
        "partials/shared_body.html",
        shared=shares.list_shared(user),
        own_quizzes=quizzes.list_own(user),
        notice=notice,
        error=error,
    )


@pages.get("/shared")
@login_required
def shared_page():
    return render_template("shared.html", active="friends", body=_shared_body())


@pages.post("/shared/quizzes/<int:share_id>/dismiss")
@login_required
def dismiss_quiz_page(share_id):
    shares.dismiss_quiz(current_user(), share_id)
    return _shared_body()


@pages.post("/shared/questions/<int:share_id>/dismiss")
@login_required
def dismiss_question_page(share_id):
    shares.dismiss_question(current_user(), share_id)
    return _shared_body()


@pages.post("/shared/questions/<int:share_id>/copy")
@login_required
def copy_page(share_id):
    quiz_id = to_int(request.form.get("quiz_id"))

    if quiz_id is None:
        return _shared_body(error="Pick a quiz to copy it into.")

    try:
        shares.copy_shared_question(current_user(), share_id, quiz_id)
    except ApiError as error:
        if error.status >= 500:
            raise
        return _shared_body(error=error.message)

    return _shared_body(notice="Copied into your quiz.")


# --- the share panel in the editor -------------------------------------------------------------


def _panel(*, title: str, action: str):
    return render_template(
        "partials/share_panel.html",
        title=title,
        action=action,
        friends=friends.list_friends(current_user()),
    )


@pages.get("/quizzes/<int:quiz_id>/share-panel")
@login_required
def quiz_panel(quiz_id):
    quizzes.authored(quiz_id, current_user(), "share a quiz")
    return _panel(title="Share this quiz", action=f"/quizzes/{quiz_id}/share")


@pages.get("/questions/<int:question_id>/share-panel")
@login_required
def question_panel(question_id):
    quizzes.owned_question(question_id, current_user())
    return _panel(title="Share this question", action=f"/questions/{question_id}/share")


@pages.get("/share-panel/close")
@login_required
def close_panel():
    return '<div id="share-panel"></div>'


def _shared_notice(count: int) -> str:
    if count == 0:
        return "Already shared with everyone you picked."
    return f"Shared with {count} friend{'' if count == 1 else 's'}."


def _closed_with_notice(message: str) -> str:
    return '<div id="share-panel"></div>' + render_template(
        "partials/editor_notice.html", message=message, oob=True
    )


@pages.post("/quizzes/<int:quiz_id>/share")
@login_required
def share_quiz_page(quiz_id):
    ids = [to_int(v) for v in request.form.getlist("friend_ids")]
    count = shares.share_quiz(current_user(), quiz_id, _friend_ids([i for i in ids if i is not None]))
    return _closed_with_notice(_shared_notice(count))


@pages.post("/questions/<int:question_id>/share")
@login_required
def share_question_page(question_id):
    ids = [to_int(v) for v in request.form.getlist("friend_ids")]
    count = shares.share_question(current_user(), question_id, _friend_ids([i for i in ids if i is not None]))
    return _closed_with_notice(_shared_notice(count))
