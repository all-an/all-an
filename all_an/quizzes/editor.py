"""The quiz editor, built from HTMX swaps.

Three regions, each re-rendered on its own so that working on one never throws away what is typed
in another:

  #details        the quiz's own fields and the publish button
  #questions      the question list, with #question-form (the add/edit form) above it
  #editor-notice  one-line status, updated out-of-band by whichever request just ran

Interactions that only change the *form* - switching question type, adding or removing a choice -
post the form's current values to the server, which returns the form re-rendered. That is the
trade HTMX asks for: a round trip instead of client-side state, and no JavaScript to keep in step
with the server's validation rules.
"""

from flask import Blueprint, abort, make_response, render_template, request

from ..auth.guards import login_required
from ..auth.sessions import current_user
from ..errors import ApiError
from ..web import go
from . import repo, service

editor = Blueprint("quiz_editor", __name__)


# --- shared pieces -----------------------------------------------------------------------------


def _notice(message: str) -> str:
    """The status line, marked to replace #editor-notice wherever it is in the page."""
    return render_template("partials/editor_notice.html", message=message, oob=True)


def _field_notice(error: ApiError) -> str:
    """Every distinct field message in one line, which is what the editor has always shown."""
    fields = error.details.get("fields") or {}
    return " ".join(dict.fromkeys(fields.values())) or error.message


def _with_notice(body: str, message: str | None) -> str:
    return body + _notice(message) if message is not None else body


def _details_context(quiz: dict | None, values: dict | None = None, fields: dict | None = None) -> dict:
    user = current_user()

    if values is None and quiz:
        values = {
            "title": quiz["title"],
            "studyFieldId": quiz["studyFieldId"],
            "subject": quiz["subject"],
            "description": quiz["description"] or "",
            "defaultTimeLimitSeconds": quiz["defaultTimeLimitSeconds"],
            "shuffleQuestions": quiz["shuffleQuestions"],
        }
    elif values is None:
        values = {"defaultTimeLimitSeconds": 30, "shuffleQuestions": False}

    return {
        "quiz": quiz,
        "values": values,
        "fields": fields or {},
        "study_fields": service.list_study_fields(),
        "known_subjects": service.list_subjects(user, True),
    }


def _owned_quiz(quiz_id: int) -> dict:
    """The quiz in full, for its author only. Anyone else gets the same 404 as for a quiz that
    does not exist."""
    quiz = service.read_quiz(quiz_id, current_user())

    if not quiz["owned"]:
        raise ApiError.not_found("No such quiz.")

    return quiz


def _questions_html(quiz: dict) -> str:
    return render_template("partials/editor_questions.html", quiz=quiz, form=None)


def _questions_response(quiz: dict, notice: str | None = None):
    """The refreshed question list, wherever the request that caused it was aimed."""
    response = make_response(_with_notice(_questions_html(quiz), notice))
    response.headers["HX-Retarget"] = "#questions"
    response.headers["HX-Reswap"] = "outerHTML"
    return response


# --- the page ----------------------------------------------------------------------------------


@editor.get("/quizzes/new")
@login_required
def new_quiz():
    return render_template("editor.html", active="quizzes", **_details_context(None), notice="")


@editor.get("/quizzes/<int:quiz_id>/edit")
@login_required
def edit_quiz(quiz_id):
    quiz = _owned_quiz(quiz_id)
    notice = "Saved." if request.args.get("saved") == "1" else ""

    return render_template("editor.html", active="quizzes", **_details_context(quiz), notice=notice)


# --- the quiz's own fields ---------------------------------------------------------------------


def _quiz_values() -> dict:
    form = request.form
    return {
        "title": form.get("title", ""),
        "studyFieldId": form.get("studyFieldId", ""),
        "subject": form.get("subject", ""),
        "description": form.get("description", ""),
        "defaultTimeLimitSeconds": form.get("defaultTimeLimitSeconds", ""),
        "shuffleQuestions": form.get("shuffleQuestions") == "on",
    }


def _invalid_details(quiz: dict | None, error: ApiError):
    if error.status != 400:
        raise error

    html = render_template(
        "partials/editor_details.html",
        **_details_context(quiz, _quiz_values(), error.details.get("fields")),
    )
    return _with_notice(html, _field_notice(error)), 422


@editor.post("/quizzes")
@login_required
def create_quiz():
    try:
        quiz = service.create_quiz(current_user(), _quiz_values())
    except ApiError as error:
        return _invalid_details(None, error)

    return go(f"/quizzes/{quiz['id']}/edit?saved=1")


@editor.post("/quizzes/<int:quiz_id>/details")
@login_required
def save_details(quiz_id):
    try:
        quiz = service.edit_quiz(quiz_id, current_user(), _quiz_values())
    except ApiError as error:
        return _invalid_details(_owned_quiz(quiz_id) if error.status == 400 else None, error)

    return _with_notice(render_template("partials/editor_details.html", **_details_context(quiz)), "Saved.")


@editor.post("/quizzes/<int:quiz_id>/editor/<action>")
@login_required
def publish(quiz_id, action):
    if action not in ("publish", "unpublish"):
        abort(404)

    quiz = service.set_visibility(quiz_id, current_user(), "PUBLIC" if action == "publish" else "PRIVATE")

    # The button lives inside the form, so whatever is typed but not yet saved comes along and goes back.
    return _with_notice(
        render_template("partials/editor_details.html", **_details_context(quiz, _quiz_values() if "title" in request.form else None)),
        "Published to the pool." if action == "publish" else "Unpublished.",
    )


# --- the question form -------------------------------------------------------------------------


def _blank_form(quiz: dict) -> dict:
    return {
        "id": None,
        "kind": "MULTIPLE_CHOICE",
        "prompt": "",
        "explanation": "",
        "timeLimitSeconds": quiz["defaultTimeLimitSeconds"],
        "options": [{"body": "", "isCorrect": True}, {"body": "", "isCorrect": False}],
    }


def _form_from_question(question: dict) -> dict:
    return {
        "id": question["id"],
        "kind": question["kind"],
        "prompt": question["prompt"],
        "explanation": question["explanation"] or "",
        "timeLimitSeconds": question["timeLimitSeconds"],
        "options": [{"body": o["body"], "isCorrect": o["isCorrect"]} for o in question["options"]],
    }


def _form_from_request() -> dict:
    """The form as the browser holds it right now, read back so the server can re-render it."""
    form = request.form
    bodies = form.getlist("option_body")
    correct = service.to_int(form.get("correct"))

    return {
        "id": service.to_int(form.get("question_id")),
        "kind": form.get("kind", "MULTIPLE_CHOICE"),
        "prompt": form.get("prompt", ""),
        "explanation": form.get("explanation", ""),
        "timeLimitSeconds": form.get("timeLimitSeconds", ""),
        # A typed question has no radio: every row is an accepted answer.
        "options": [
            {"body": body, "isCorrect": form.get("kind") == "TYPED" or index == correct}
            for index, body in enumerate(bodies)
        ],
    }


def _form_html(quiz_id: int, form: dict, fields: dict | None = None) -> str:
    return render_template("partials/question_form.html", quiz_id=quiz_id, form=form, fields=fields or {})


@editor.get("/quizzes/<int:quiz_id>/question-form")
@login_required
def new_question_form(quiz_id):
    return _form_html(quiz_id, _blank_form(_owned_quiz(quiz_id)))


@editor.get("/quizzes/<int:quiz_id>/question-form/close")
@login_required
def close_question_form(quiz_id):
    return '<div id="question-form"></div>'


@editor.get("/questions/<int:question_id>/form")
@login_required
def edit_question_form(question_id):
    question, _ = service.owned_question(question_id, current_user())
    quiz = _owned_quiz(question["quiz_id"])
    current = next(q for q in quiz["questions"] if q["id"] == question_id)

    return _form_html(quiz["id"], _form_from_question(current))


@editor.post("/quizzes/<int:quiz_id>/question-form/<op>")
@login_required
def reshape_question_form(quiz_id, op):
    """Switch type, add a choice, remove a choice. Nothing is saved; the form is just redrawn."""
    _owned_quiz(quiz_id)
    form = _form_from_request()
    options = form["options"]

    if op == "kind":
        form["kind"] = request.form.get("new_kind", form["kind"])

        if form["kind"] == "TYPED":
            # Every typed row is an accepted answer, so drop the blanks and mark the rest correct.
            filled = [{"body": o["body"], "isCorrect": True} for o in options if o["body"].strip()]
            form["options"] = filled or [{"body": "", "isCorrect": True}]
        elif len(options) < 2:
            form["options"] = options + [{"body": "", "isCorrect": False}] * (2 - len(options))
        else:
            # Coming from typed, every row was "correct"; a choice question has exactly one.
            form["options"] = [{**o, "isCorrect": i == 0} for i, o in enumerate(options)] if all(
                o["isCorrect"] for o in options
            ) else options
    elif op == "add-option":
        options.append({"body": "", "isCorrect": False})
    elif op == "remove-option":
        index = service.to_int(request.form.get("index"))
        form["options"] = [o for i, o in enumerate(options) if i != index]
    else:
        abort(404)

    return _form_html(quiz_id, form)


def _payload(form: dict) -> dict:
    return {
        "kind": form["kind"],
        "prompt": form["prompt"],
        "explanation": form["explanation"],
        "timeLimitSeconds": form["timeLimitSeconds"],
        "options": form["options"],
    }


@editor.post("/quizzes/<int:quiz_id>/questions")
@login_required
def save_question(quiz_id):
    user = current_user()
    form = _form_from_request()

    try:
        if form["id"]:
            quiz = service.edit_question(form["id"], user, _payload(form))
        else:
            quiz = service.add_question(quiz_id, user, _payload(form))
    except ApiError as error:
        if error.status != 400:
            raise

        # Back into the form, errors showing; the request was aimed at it, so no retargeting.
        return _with_notice(_form_html(quiz_id, form, error.details.get("fields")), _field_notice(error)), 422

    return _questions_response(quiz, "")


# --- the question list -------------------------------------------------------------------------


@editor.post("/questions/<int:question_id>/<action>")
@login_required
def question_action(question_id, action):
    user = current_user()
    question, _ = service.owned_question(question_id, user)
    quiz_id = question["quiz_id"]

    match action:
        case "delete":
            quiz = service.remove_question(question_id, user)
        case "archive" | "unarchive":
            service.set_question_archived(question_id, user, action == "archive")
            quiz = _owned_quiz(quiz_id)
        case "up" | "down":
            order = [q["id"] for q in _owned_quiz(quiz_id)["questions"]]
            at = order.index(question_id)
            to = at + (-1 if action == "up" else 1)

            if 0 <= to < len(order):
                order[at], order[to] = order[to], order[at]

            quiz = service.reorder(quiz_id, user, order)
        case _:
            abort(404)

    return _questions_response(quiz, "")
