"""Quizzes, their questions, and who may do what to them.

`viewer` is the signed-in user's row (id, username, email, role) or None.
"""

from .. import db
from ..errors import ApiError
from ..util import iso, to_int  # noqa: F401  (re-exported: other modules import them from here)
from ..validate import Fields
from . import repo


# --- shapes ------------------------------------------------------------------------------------


def to_summary(row: dict, viewer_id: int | None) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "subject": row["subject"],
        "studyField": {"slug": row["study_field_slug"], "name": row["study_field_name"]},
        "visibility": row["visibility"],
        "questionCount": row["question_count"],
        "createdAt": iso(row["created_at"]),
        "owned": row["owner_id"] is not None and row["owner_id"] == viewer_id,
        "archived": row["archived"],
    }


# --- access rules ------------------------------------------------------------------------------


def readable(quiz_id: int, viewer: dict | None) -> dict:
    """A quiz the viewer may see: published or their own. Anything else is a 404
    rather than a 403, so a private quiz's existence is not confirmed to people who cannot read it."""
    row = repo.find_quiz_by_id(quiz_id)

    if row is None:
        raise ApiError.not_found("No such quiz.")

    if row["visibility"] == "PUBLIC":
        return row

    if viewer and row["owner_id"] == viewer["id"]:
        return row

    raise ApiError.not_found("No such quiz.")


def writable(quiz_id: int, viewer: dict) -> dict:
    """A quiz the viewer may change: their own, or - for an administrator - any published one, so a
    bad public quiz can be taken down. Seeded quizzes have no owner, so only an administrator
    reaches them, and only to remove them."""
    row = repo.find_quiz_by_id(quiz_id)

    if row is None:
        raise ApiError.not_found("No such quiz.")

    if row["owner_id"] == viewer["id"] or (viewer["role"] == "ADMIN" and row["visibility"] == "PUBLIC"):
        return row

    raise ApiError.not_found("No such quiz.")


def authored(quiz_id: int, viewer: dict, action: str) -> dict:
    """Editing is the author's alone, even for an administrator who may delete."""
    row = writable(quiz_id, viewer)

    if row["owner_id"] != viewer["id"]:
        raise ApiError.forbidden(f"Only the author can {action}.")

    return row


# --- reading -----------------------------------------------------------------------------------


def list_study_fields() -> list[dict]:
    return [
        {"id": r["id"], "slug": r["slug"], "name": r["name"], "publicQuizCount": r["public_quiz_count"]}
        for r in repo.find_study_fields()
    ]


def list_subjects(viewer: dict | None, mine: bool, study_field: str | None = None) -> list[str]:
    if mine and viewer:
        return repo.find_own_subjects(viewer["id"])

    return repo.find_public_subjects(study_field)


def list_own(viewer: dict, study_field=None, subject=None, archived=False) -> list[dict]:
    rows = repo.find_quizzes_by_owner(viewer["id"], study_field, subject, archived)
    return [to_summary(row, viewer["id"]) for row in rows]


def list_public(viewer, study_field=None, subject=None, limit=50, offset=0, archived=False) -> list[dict]:
    viewer_id = viewer["id"] if viewer else None
    rows = repo.find_public_quizzes(viewer_id, study_field, subject, limit, offset, archived)
    return [to_summary(row, viewer_id) for row in rows]


def read_quiz(quiz_id: int, viewer: dict | None) -> dict:
    row = readable(quiz_id, viewer)
    detail = to_summary(row, viewer["id"] if viewer else None)
    detail |= {
        "studyFieldId": row["study_field_id"],
        "defaultTimeLimitSeconds": row["default_time_limit_seconds"],
        "shuffleQuestions": row["shuffle_questions"],
    }

    # Only the author is sent the questions: the answers are in them.
    if not detail["owned"]:
        return detail

    questions = repo.find_questions(quiz_id)
    ids = [q["id"] for q in questions]
    options = repo.find_options(ids)
    archived = repo.find_archived_question_ids(row["owner_id"], ids) if row["owner_id"] else set()

    detail["questions"] = [
        {
            "id": q["id"],
            "position": q["position"],
            "kind": q["kind"],
            "prompt": q["prompt"],
            "explanation": q["explanation"],
            "timeLimitSeconds": q["time_limit_seconds"],
            "archived": q["id"] in archived,
            "options": [
                {"id": o["id"], "body": o["body"], "isCorrect": o["is_correct"]}
                for o in options
                if o["question_id"] == q["id"]
            ],
        }
        for q in questions
    ]
    return detail


# --- writing quizzes ---------------------------------------------------------------------------


def _time_limit_checks(fields: Fields, field: str, value: int | None) -> None:
    fields.check(field, value is not None, "the time limit must be a whole number of seconds")
    if value is not None:
        fields.check(field, value >= 5, "the time limit must be at least 5 seconds")
        fields.check(field, value <= 600, "the time limit must be at most 10 minutes")


def quiz_fields(data: dict) -> dict:
    """Validates and normalises in one step, so nothing downstream sees untrimmed text."""
    title = str(data.get("title") or "").strip()
    subject = str(data.get("subject") or "").strip()
    description = str(data.get("description") or "")
    study_field_id = to_int(data.get("studyFieldId"))
    raw_limit = data.get("defaultTimeLimitSeconds")
    limit = 30 if raw_limit in (None, "") else to_int(raw_limit)

    fields = Fields()
    fields.check("title", bool(title), "title is required")
    fields.check("title", len(title) <= 120, "title must be at most 120 characters")
    fields.check("description", len(description) <= 2000, "description must be at most 2000 characters")
    fields.check("studyFieldId", study_field_id is not None, "pick a study field")
    fields.check("subject", bool(subject), "subject is required")
    fields.check("subject", len(subject) <= 64, "subject must be at most 64 characters")
    _time_limit_checks(fields, "defaultTimeLimitSeconds", limit)
    fields.finish()

    return {
        "title": title,
        "description": description.strip() or None,
        "study_field_id": study_field_id,
        "subject": subject,
        "default_time_limit_seconds": limit,
        "shuffle_questions": data.get("shuffleQuestions") in (True, "true", "on", "1", 1),
    }


def _assert_study_field(field_id: int) -> None:
    # A smallint column: an id outside its range cannot exist, and asking Postgres would be an error.
    if not (-32768 <= field_id <= 32767) or not repo.study_field_exists(field_id):
        raise ApiError.bad_request_field(
            "That study field does not exist.", "studyFieldId", "Pick a study field from the list."
        )


def create_quiz(viewer: dict, data: dict) -> dict:
    fields = quiz_fields(data)
    _assert_study_field(fields["study_field_id"])

    return read_quiz(repo.insert_quiz(viewer["id"], fields), viewer)


def edit_quiz(quiz_id: int, viewer: dict, data: dict) -> dict:
    authored(quiz_id, viewer, "edit a quiz")

    fields = quiz_fields(data)
    _assert_study_field(fields["study_field_id"])
    repo.update_quiz(quiz_id, fields)

    return read_quiz(quiz_id, viewer)


def set_visibility(quiz_id: int, viewer: dict, visibility: str) -> dict:
    row = authored(quiz_id, viewer, "publish or unpublish a quiz")

    if visibility == "PUBLIC" and row["question_count"] == 0:
        raise ApiError.bad_request("Add at least one question before publishing.")

    repo.update_visibility(quiz_id, visibility)
    return read_quiz(quiz_id, viewer)


def remove_quiz(quiz_id: int, viewer: dict) -> None:
    writable(quiz_id, viewer)
    repo.delete_quiz(quiz_id)


def set_archived(quiz_id: int, viewer: dict, archived: bool) -> None:
    """Archiving is personal: it hides the quiz from this viewer's lists and nobody else's, which is
    why anyone who can read a quiz can archive it."""
    readable(quiz_id, viewer)

    if archived:
        repo.archive_quiz(viewer["id"], quiz_id)
    else:
        repo.unarchive_quiz(viewer["id"], quiz_id)


# --- writing questions -------------------------------------------------------------------------


def normalise_options(kind: str, raw_options: list[dict]) -> list[tuple[str, bool]]:
    """What a question needs to be answerable: at least two choices and a marked answer for multiple
    choice; at least one accepted spelling for typed. Typed options are all "correct" by
    definition - each is an answer that will be accepted."""
    options = [
        (str(o.get("body") or "").strip(), bool(o.get("isCorrect")))
        for o in raw_options
        if str(o.get("body") or "").strip()
    ]

    if kind == "MULTIPLE_CHOICE":
        if len(options) < 2:
            raise ApiError.bad_request_field(
                "A multiple-choice question needs at least two choices.", "options", "Add at least two choices."
            )

        if not any(correct for _, correct in options):
            raise ApiError.bad_request_field(
                "Mark which choice is correct.", "options", "Mark at least one choice as correct."
            )

        return options

    if not options:
        raise ApiError.bad_request_field(
            "A typed question needs at least one accepted answer.", "options", "Add the answer you will accept."
        )

    return [(body, True) for body, _ in options]


def validate_question(data: dict) -> dict:
    kind = data.get("kind")
    prompt = str(data.get("prompt") or "").strip()
    explanation = str(data.get("explanation") or "")
    raw_limit = data.get("timeLimitSeconds")
    limit = None if raw_limit in (None, "") else to_int(raw_limit)
    raw_options = [o for o in (data.get("options") or []) if isinstance(o, dict)]

    fields = Fields()
    fields.check("kind", kind in ("MULTIPLE_CHOICE", "TYPED"), "pick a question type")
    fields.check("prompt", bool(prompt), "the question is required")
    fields.check("prompt", len(prompt) <= 2000, "the question must be at most 2000 characters")
    fields.check("explanation", len(explanation) <= 2000, "the explanation must be at most 2000 characters")
    fields.check("options", len(raw_options) <= 10, "at most 10 answers")
    fields.check(
        "options",
        all(len(str(o.get("body") or "").strip()) <= 1000 for o in raw_options),
        "an answer must be at most 1000 characters",
    )
    if raw_limit not in (None, ""):
        _time_limit_checks(fields, "timeLimitSeconds", limit)
    fields.finish()

    return {
        "kind": kind,
        "prompt": prompt,
        "explanation": explanation.strip() or None,
        "time_limit_seconds": limit,
        "options": normalise_options(kind, raw_options),
    }


def add_question(quiz_id: int, viewer: dict, data: dict) -> dict:
    quiz = authored(quiz_id, viewer, "add questions")
    valid = validate_question(data)
    valid["time_limit_seconds"] = valid["time_limit_seconds"] or quiz["default_time_limit_seconds"]

    with db.transaction() as conn:
        question_id = repo.insert_question(conn, quiz_id, valid)
        repo.replace_options(conn, question_id, valid["options"])

    return read_quiz(quiz_id, viewer)


def owned_question(question_id: int, viewer: dict) -> tuple[dict, dict]:
    """A question the viewer authored, with its quiz. Anything else is a 404: a question in somebody
    else's quiz does not exist as far as this viewer is concerned."""
    question = repo.find_question_by_id(question_id)
    quiz = repo.find_quiz_by_id(question["quiz_id"]) if question else None

    if not question or not quiz or quiz["owner_id"] != viewer["id"]:
        raise ApiError.not_found("No such question.")

    return question, quiz


def edit_question(question_id: int, viewer: dict, data: dict) -> dict:
    question, quiz = owned_question(question_id, viewer)
    valid = validate_question(data)
    valid["time_limit_seconds"] = valid["time_limit_seconds"] or quiz["default_time_limit_seconds"]

    with db.transaction() as conn:
        repo.update_question_fields(conn, question_id, valid)
        repo.replace_options(conn, question_id, valid["options"])

    return read_quiz(question["quiz_id"], viewer)


def remove_question(question_id: int, viewer: dict) -> dict:
    question, _ = owned_question(question_id, viewer)
    repo.delete_question(question_id)

    return read_quiz(question["quiz_id"], viewer)


def set_question_archived(question_id: int, viewer: dict, archived: bool) -> None:
    question = repo.find_question_by_id(question_id)

    if question is None:
        raise ApiError.not_found("No such question.")

    readable(question["quiz_id"], viewer)

    if archived:
        repo.archive_question(viewer["id"], question_id)
    else:
        repo.unarchive_question(viewer["id"], question_id)


def reorder(quiz_id: int, viewer: dict, question_ids: list[int]) -> dict:
    """The new order must be a permutation of the quiz's questions: no omissions, no repeats,
    nothing from elsewhere. Anything looser would let a stale client silently drop or duplicate one."""
    authored(quiz_id, viewer, "reorder questions")

    existing = {q["id"] for q in repo.find_questions(quiz_id)}

    if len(set(question_ids)) != len(question_ids) or set(question_ids) != existing:
        raise ApiError.bad_request("The new order must list every question in the quiz exactly once.")

    with db.transaction() as conn:
        repo.reorder_questions(conn, quiz_id, question_ids)

    return read_quiz(quiz_id, viewer)
