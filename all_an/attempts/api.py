"""/api/attempts - the JSON contract."""

from flask import Blueprint, jsonify, request

from ..auth.guards import login_required
from ..auth.sessions import current_user
from ..errors import ApiError
from ..quizzes.service import to_int
from . import service

api = Blueprint("attempts_api", __name__, url_prefix="/api/attempts")


def _json() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError.bad_request("That request was not valid.")
    return body


@api.get("")
@login_required
def history():
    return jsonify(service.history(current_user()))


@api.post("")
@login_required
def start():
    quiz_id = to_int(_json().get("quizId"))

    if quiz_id is None:
        raise ApiError.bad_request_field("That request was not valid.", "quizId", "quizId must be a whole number")

    attempt_id, total = service.start(current_user(), quiz_id)
    return jsonify({"attemptId": attempt_id, "total": total}), 201


@api.get("/<int:attempt_id>/current")
@login_required
def current(attempt_id):
    return jsonify(service.current(attempt_id, current_user()))


@api.post("/<int:attempt_id>/answer")
@login_required
def answer(attempt_id):
    body = _json()
    text = body.get("text")
    given = service.answer(
        attempt_id,
        current_user(),
        option_id=to_int(body.get("optionId")),
        text=text if isinstance(text, str) else None,
    )

    for private in ("questionId", "prompt", "position"):
        given.pop(private)

    return jsonify(given)


@api.post("/<int:attempt_id>/finish")
@login_required
def finish(attempt_id):
    service.finish(attempt_id, current_user())
    return "", 204


@api.get("/<int:attempt_id>")
@login_required
def result(attempt_id):
    return jsonify(service.result(attempt_id, current_user()))


@api.delete("/<int:attempt_id>")
@login_required
def remove(attempt_id):
    service.remove(attempt_id, current_user())
    return "", 204
