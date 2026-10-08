"""Starting and taking a quiz, and looking at results.

The runner is one container, #runner, that is replaced wholesale: first by the question, then by
the verdict, then by the next question. The only script involved is the countdown (static/js/
runner.js), which is cosmetic - the server measures the time that counts.
"""

from flask import Blueprint, abort, make_response, render_template, request

from ..auth.guards import login_required
from ..auth.sessions import current_user
from ..errors import ApiError
from ..quizzes import service as quizzes
from ..web import go
from . import service

pages = Blueprint("attempts_pages", __name__)


# --- starting ----------------------------------------------------------------------------------


@pages.get("/quizzes/<int:quiz_id>/take")
@login_required
def take(quiz_id):
    return render_template("start.html", active="quizzes", quiz_id=quiz_id, message="")


@pages.post("/quizzes/<int:quiz_id>/start")
@login_required
def start(quiz_id):
    """Starting is a POST so that following a link never creates an attempt - a prefetch or a
    crawler would otherwise start quizzes on someone's behalf."""
    try:
        attempt_id, _ = service.start(current_user(), quiz_id)
    except ApiError as error:
        if error.status not in (400, 404):
            raise
        return render_template("partials/start_failed.html", quiz_id=quiz_id, message=error.message), 422

    return go(f"/quizzes/attempt/{attempt_id}")


# --- the runner --------------------------------------------------------------------------------


@pages.get("/quizzes/attempt/<int:attempt_id>")
@login_required
def runner(attempt_id):
    service._owned_attempt(attempt_id, current_user())  # a 404 page, not a runner that cannot load
    return render_template("runner.html", active="quizzes", attempt_id=attempt_id)


@pages.get("/attempts/<int:attempt_id>/question")
@login_required
def question(attempt_id):
    current = service.current(attempt_id, current_user())

    if current.get("finished"):
        return go(f"/results/{attempt_id}")

    return render_template("partials/runner_question.html", attempt_id=attempt_id, q=current)


@pages.post("/attempts/<int:attempt_id>/answer")
@login_required
def answer(attempt_id):
    verdict = service.answer(
        attempt_id,
        current_user(),
        option_id=quizzes.to_int(request.form.get("option_id")),
        text=request.form.get("text"),
    )

    return render_template("partials/runner_feedback.html", attempt_id=attempt_id, v=verdict)


@pages.post("/attempts/<int:attempt_id>/finish")
@login_required
def give_up(attempt_id):
    service.finish(attempt_id, current_user())
    return go(f"/results/{attempt_id}")


@pages.post("/questions/<int:question_id>/learned")
@login_required
def learned(question_id):
    """"I've learned this": archives the question for this person, so they are not asked it again."""
    quizzes.set_question_archived(question_id, current_user(), True)
    return '<span class="archived-note" id="learn-slot">Learned — you won\'t be asked this again.</span>'


# --- results -----------------------------------------------------------------------------------


@pages.get("/results")
@login_required
def history():
    return render_template("history.html", active="results", items=service.history(current_user()))


@pages.post("/results/<int:attempt_id>/delete")
@login_required
def delete(attempt_id):
    service.remove(attempt_id, current_user())

    if not request.headers.get("HX-Request"):
        return go("/results")

    return render_template("partials/history_body.html", items=service.history(current_user()))


@pages.get("/results/<int:attempt_id>")
@login_required
def result(attempt_id):
    attempt = service.result(attempt_id, current_user())
    percent = 0 if attempt["total"] == 0 else round(attempt["correct"] / attempt["total"] * 100)

    return render_template("result.html", active="results", attempt=attempt, percent=percent)


@pages.app_template_filter("seconds")
def seconds(ms):
    return "—" if ms is None else f"{ms / 1000:.1f}s"
