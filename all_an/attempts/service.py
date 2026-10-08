"""Taking a quiz: starting an attempt, serving one question at a time against a server-side clock,
marking answers, and reporting results.

The server owns the clock. The browser shows a countdown, but the time that counts is measured
from when the server first served the question - so a client that pauses its timer, or edits it
in dev tools, gains nothing. Both ends of that measurement are read from the database's clock
(`served_at` and `NOW()`), so a skew between the app host and the database cannot change who
times out.
"""

import random

from .. import db, shares
from ..errors import ApiError
from ..grading import grade_multiple_choice, grade_typed, is_timed_out
from ..quizzes import repo as quiz_repo
from ..quizzes.service import iso
from ..validate import Fields

# Totals are computed by the query rather than stored: a stored score could drift from the answers
# it summarises, and there is nowhere to be wrong if it is never stored.
_ATTEMPT_SELECT = """
  SELECT a.id, a.quiz_id, a.quiz_title_snapshot, a.started_at, a.finished_at,
         (SELECT COUNT(*) FROM attempt_questions WHERE attempt_id = a.id) AS total,
         (SELECT COUNT(*) FROM attempt_questions
           WHERE attempt_id = a.id AND answered_at IS NOT NULL) AS answered,
         (SELECT COUNT(*) FROM attempt_questions
           WHERE attempt_id = a.id AND is_correct) AS correct
  FROM attempts a"""

_QUESTION_COLUMNS = """id, question_id, prompt_snapshot, position, served_at, given_text,
                       given_option_id, is_correct, timed_out, elapsed_ms"""


def to_summary(row: dict) -> dict:
    return {
        "id": row["id"],
        "quizId": row["quiz_id"],
        "quizTitle": row["quiz_title_snapshot"],
        "startedAt": iso(row["started_at"]),
        "finishedAt": iso(row["finished_at"]) if row["finished_at"] else None,
        "total": row["total"],
        "answered": row["answered"],
        "correct": row["correct"],
    }


# --- persistence -------------------------------------------------------------------------------


def _find_attempt(attempt_id: int, user_id: int) -> dict | None:
    return db.query_one(f"{_ATTEMPT_SELECT} WHERE a.id = %s AND a.user_id = %s", (attempt_id, user_id))


def _owned_attempt(attempt_id: int, viewer: dict) -> dict:
    attempt = _find_attempt(attempt_id, viewer["id"])

    if attempt is None:
        raise ApiError.not_found("No such attempt.")

    return attempt


def _next_unanswered(attempt_id: int) -> dict | None:
    return db.query_one(
        f"""SELECT {_QUESTION_COLUMNS} FROM attempt_questions
            WHERE attempt_id = %s AND answered_at IS NULL ORDER BY position LIMIT 1""",
        (attempt_id,),
    )


def _stamp_served(attempt_question_id: int) -> int:
    """Marks the moment a question was first shown and returns how long ago that was, in ms.

    COALESCE keeps the first stamp: reloading the page mid-question must not hand out a fresh clock.
    """
    row = db.query_one(
        """
        UPDATE attempt_questions SET served_at = COALESCE(served_at, NOW())
        WHERE id = %s
        RETURNING (EXTRACT(EPOCH FROM (NOW() - served_at)) * 1000)::bigint AS elapsed_ms
        """,
        (attempt_question_id,),
    )
    return int(row["elapsed_ms"])


def _record_answer(attempt_question_id: int, *, text, option_id, correct, timed_out, elapsed_ms) -> None:
    db.execute(
        """
        UPDATE attempt_questions
        SET answered_at = NOW(), given_text = %s, given_option_id = %s,
            is_correct = %s, timed_out = %s, elapsed_ms = %s
        WHERE id = %s
        """,
        (text, option_id, correct, timed_out, elapsed_ms, attempt_question_id),
    )


def _skip(attempt_question_id: int) -> None:
    _record_answer(attempt_question_id, text=None, option_id=None, correct=False, timed_out=False, elapsed_ms=0)


def _finish(attempt_id: int) -> None:
    db.execute("UPDATE attempts SET finished_at = NOW() WHERE id = %s AND finished_at IS NULL", (attempt_id,))


# --- the rules ---------------------------------------------------------------------------------


def start(viewer: dict, quiz_id: int) -> tuple[int, int]:
    """Snapshots the questions into the attempt, so editing or deleting the quiz later cannot
    change what an old result says it asked. Returns (attempt id, question count)."""
    quiz = quiz_repo.find_quiz_by_id(quiz_id)

    if quiz is None:
        raise ApiError.not_found("No such quiz.")

    may_take = (
        quiz["visibility"] == "PUBLIC"
        or quiz["owner_id"] == viewer["id"]
        or shares.is_quiz_shared_with(quiz_id, viewer["id"])
    )

    if not may_take:
        raise ApiError.not_found("No such quiz.")

    questions = quiz_repo.find_questions(quiz_id)

    if not questions:
        raise ApiError.bad_request("That quiz has no questions yet.")

    # Questions the taker has marked as learned are left out - that is what archiving one means.
    archived = quiz_repo.find_archived_question_ids(viewer["id"], [q["id"] for q in questions])
    remaining = [q for q in questions if q["id"] not in archived]

    if not remaining:
        raise ApiError.bad_request(
            "You have archived every question in this quiz. Unarchive one to take it again."
        )

    if quiz["shuffle_questions"]:
        random.shuffle(remaining)

    with db.transaction() as conn:
        attempt_id = conn.execute(
            "INSERT INTO attempts (user_id, quiz_id, quiz_title_snapshot) VALUES (%s, %s, %s) RETURNING id",
            (viewer["id"], quiz_id, quiz["title"]),
        ).fetchone()["id"]

        for position, question in enumerate(remaining, start=1):
            conn.execute(
                """INSERT INTO attempt_questions (attempt_id, question_id, prompt_snapshot, position)
                   VALUES (%s, %s, %s, %s)""",
                (attempt_id, question["id"], question["prompt"], position),
            )

    return attempt_id, len(remaining)


def current(attempt_id: int, viewer: dict) -> dict:
    """The question to show now, starting its clock if this is the first time it has been shown.

    A question that has since been deleted is recorded as skipped rather than blocking the attempt.
    Returns `{"finished": True}` when there is nothing left.
    """
    attempt = _owned_attempt(attempt_id, viewer)

    while True:
        nxt = _next_unanswered(attempt_id)

        if nxt is None:
            _finish(attempt_id)
            return {"finished": True}

        question = quiz_repo.find_question_by_id(nxt["question_id"]) if nxt["question_id"] else None

        if question is None:
            _skip(nxt["id"])
            continue

        elapsed_ms = _stamp_served(nxt["id"])
        remaining_ms = max(0, question["time_limit_seconds"] * 1000 - elapsed_ms)

        result = {
            "attemptQuestionId": nxt["id"],
            "questionId": question["id"],
            "position": nxt["position"],
            "total": attempt["total"],
            "prompt": nxt["prompt_snapshot"],
            "kind": question["kind"],
            "timeLimitSeconds": question["time_limit_seconds"],
            "remainingMs": remaining_ms,
        }

        if question["kind"] == "MULTIPLE_CHOICE":
            options = quiz_repo.find_options([question["id"]])
            random.shuffle(options)
            # Only id and body: which one is correct stays on the server until it has been answered.
            result["options"] = [{"id": o["id"], "body": o["body"]} for o in options]

        return result


def validate_answer(text) -> None:
    fields = Fields()
    fields.check("text", len(text or "") <= 500, "that answer is too long")
    fields.finish()


def answer(attempt_id: int, viewer: dict, *, option_id: int | None = None, text: str | None = None) -> dict:
    _owned_attempt(attempt_id, viewer)
    validate_answer(text)

    nxt = _next_unanswered(attempt_id)

    if nxt is None:
        raise ApiError.bad_request("That attempt is already finished.")

    question = quiz_repo.find_question_by_id(nxt["question_id"]) if nxt["question_id"] else None

    if question is None:
        raise ApiError.not_found("That question no longer exists.")

    options = quiz_repo.find_options([question["id"]])

    # Answering before the question was ever served starts its clock now, rather than counting the
    # time as zero.
    elapsed_ms = _stamp_served(nxt["id"])
    timed_out = is_timed_out(elapsed_ms, question["time_limit_seconds"])
    is_multiple_choice = question["kind"] == "MULTIPLE_CHOICE"

    # A late answer is wrong whatever it says.
    if timed_out:
        correct = False
    elif is_multiple_choice:
        correct = grade_multiple_choice(option_id, [{"id": o["id"], "is_correct": o["is_correct"]} for o in options])
    else:
        correct = grade_typed(text or "", [o["body"] for o in options])

    _record_answer(
        nxt["id"],
        text=text,
        option_id=option_id if is_multiple_choice else None,
        correct=correct,
        timed_out=timed_out,
        elapsed_ms=min(max(elapsed_ms, 0), 2_147_483_647),
    )

    remaining = db.query_one(
        "SELECT COUNT(*) AS n FROM attempt_questions WHERE attempt_id = %s AND answered_at IS NULL",
        (attempt_id,),
    )["n"]
    finished = remaining == 0

    if finished:
        _finish(attempt_id)

    return {
        "correct": correct,
        "timedOut": timed_out,
        "correctAnswer": " / ".join(o["body"] for o in options if o["is_correct"]),
        "explanation": question["explanation"],
        "finished": finished,
        # The page needs these to draw the verdict next to the question; the JSON API ignores them.
        "questionId": question["id"],
        "prompt": nxt["prompt_snapshot"],
        "position": nxt["position"],
    }


def finish(attempt_id: int, viewer: dict) -> None:
    _owned_attempt(attempt_id, viewer)
    _finish(attempt_id)


def result(attempt_id: int, viewer: dict) -> dict:
    attempt = _owned_attempt(attempt_id, viewer)
    rows = db.query(
        f"SELECT {_QUESTION_COLUMNS} FROM attempt_questions WHERE attempt_id = %s ORDER BY position",
        (attempt_id,),
    )
    options = quiz_repo.find_options([r["question_id"] for r in rows if r["question_id"] is not None])

    def describe(row: dict) -> dict:
        mine = [o for o in options if o["question_id"] == row["question_id"]]
        chosen = next((o for o in mine if o["id"] == row["given_option_id"]), None)

        return {
            "position": row["position"],
            "prompt": row["prompt_snapshot"],
            "yourAnswer": chosen["body"] if chosen else row["given_text"],
            # None, not "", when the question has since been deleted: "no answer on file" and "the
            # answer is blank" are different things to show.
            "correctAnswer": " / ".join(o["body"] for o in mine if o["is_correct"]) if mine else None,
            "isCorrect": row["is_correct"],
            "timedOut": row["timed_out"],
            "elapsedMs": row["elapsed_ms"],
        }

    return {**to_summary(attempt), "questions": [describe(r) for r in rows]}


def history(viewer: dict) -> list[dict]:
    rows = db.query(
        f"{_ATTEMPT_SELECT} WHERE a.user_id = %s ORDER BY a.started_at DESC LIMIT 50", (viewer["id"],)
    )
    return [to_summary(r) for r in rows]


def remove(attempt_id: int, viewer: dict) -> None:
    if db.execute("DELETE FROM attempts WHERE id = %s AND user_id = %s", (attempt_id, viewer["id"])) == 0:
        raise ApiError.not_found("No such attempt.")
