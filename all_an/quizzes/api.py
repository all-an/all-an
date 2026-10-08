"""The /api/quizzes and /api/questions routes: the JSON contract the Rust and Node versions spoke."""

from flask import Blueprint, jsonify, request

from ..auth.guards import login_required
from ..auth.sessions import current_user
from ..errors import ApiError
from . import service

api = Blueprint("quizzes_api", __name__, url_prefix="/api")


def _json() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError.bad_request("That request was not valid.")
    return body


def _param(name: str) -> str | None:
    value = request.args.get(name, "").strip()
    return value or None


def _flag(name: str) -> bool:
    return request.args.get(name) == "true"


@api.get("/quizzes/study-fields")
def study_fields():
    return jsonify(service.list_study_fields())


@api.get("/quizzes/subjects")
def subjects():
    mine = request.args.get("scope") == "mine"
    return jsonify(service.list_subjects(current_user(), mine, _param("studyField")))


@api.get("/quizzes/public")
def public_quizzes():
    # Anything unparseable or zero falls back to the default, as `Number(x) || 50` did.
    limit = min(service.to_int(request.args.get("limit")) or 50, 100)
    offset = max(service.to_int(request.args.get("offset")) or 0, 0)

    return jsonify(
        service.list_public(
            current_user(), _param("studyField"), _param("subject"), limit, offset, _flag("archived")
        )
    )


@api.get("/quizzes")
@login_required
def own_quizzes():
    return jsonify(service.list_own(current_user(), _param("studyField"), _param("subject"), _flag("archived")))


@api.post("/quizzes")
@login_required
def create_quiz():
    return jsonify(service.create_quiz(current_user(), _json())), 201


@api.get("/quizzes/<int:quiz_id>")
def read_quiz(quiz_id):
    return jsonify(service.read_quiz(quiz_id, current_user()))


@api.put("/quizzes/<int:quiz_id>")
@login_required
def edit_quiz(quiz_id):
    return jsonify(service.edit_quiz(quiz_id, current_user(), _json()))


@api.patch("/quizzes/<int:quiz_id>/visibility")
@login_required
def set_visibility(quiz_id):
    visibility = _json().get("visibility")

    if visibility not in ("PRIVATE", "PUBLIC"):
        raise ApiError.bad_request_field(
            "That request was not valid.", "visibility", "visibility must be PRIVATE or PUBLIC"
        )

    return jsonify(service.set_visibility(quiz_id, current_user(), visibility))


@api.delete("/quizzes/<int:quiz_id>")
@login_required
def delete_quiz(quiz_id):
    service.remove_quiz(quiz_id, current_user())
    return "", 204


@api.put("/quizzes/<int:quiz_id>/archive")
@login_required
def archive_quiz(quiz_id):
    service.set_archived(quiz_id, current_user(), True)
    return "", 204


@api.delete("/quizzes/<int:quiz_id>/archive")
@login_required
def unarchive_quiz(quiz_id):
    service.set_archived(quiz_id, current_user(), False)
    return "", 204


@api.post("/quizzes/<int:quiz_id>/questions")
@login_required
def add_question(quiz_id):
    return jsonify(service.add_question(quiz_id, current_user(), _json())), 201


@api.patch("/quizzes/<int:quiz_id>/order")
@login_required
def reorder(quiz_id):
    ids = _json().get("questionIds")

    if not isinstance(ids, list) or not ids or any(service.to_int(i) is None for i in ids):
        raise ApiError.bad_request_field(
            "That request was not valid.", "questionIds", "Provide the question ids in the new order."
        )

    return jsonify(service.reorder(quiz_id, current_user(), [service.to_int(i) for i in ids]))


@api.put("/questions/<int:question_id>")
@login_required
def edit_question(question_id):
    return jsonify(service.edit_question(question_id, current_user(), _json()))


@api.delete("/questions/<int:question_id>")
@login_required
def delete_question(question_id):
    return jsonify(service.remove_question(question_id, current_user()))


@api.put("/questions/<int:question_id>/archive")
@login_required
def archive_question(question_id):
    service.set_question_archived(question_id, current_user(), True)
    return "", 204


@api.delete("/questions/<int:question_id>/archive")
@login_required
def unarchive_question(question_id):
    service.set_question_archived(question_id, current_user(), False)
    return "", 204
