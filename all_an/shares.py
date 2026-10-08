"""Sharing quizzes and single questions with friends, and the recipient's inbox of what has been
shared with them."""

from flask import current_app

from . import db, friends, mail, users
from .errors import ApiError
from .quizzes import repo as quiz_repo
from .util import iso


def is_quiz_shared_with(quiz_id: int, user_id: int) -> bool:
    return db.query_one(
        "SELECT EXISTS (SELECT 1 FROM quiz_shares WHERE quiz_id = %s AND shared_with_id = %s) AS e",
        (quiz_id, user_id),
    )["e"]


def _friends_among(viewer: dict, ids: list[int]) -> list[dict]:
    """Only friends, and only ones that exist: ids the sender is not friends with are dropped
    rather than rejected, so a stale picker does not fail a share to the people who are still
    valid. If that leaves nobody, the sender asked for something they may not do."""
    if not ids:
        raise ApiError.bad_request("Choose at least one friend.")

    allowed = [u for u in users.find_by_ids(ids) if friends.are_friends(viewer["id"], u["id"])]

    if not allowed:
        raise ApiError.forbidden("You can only share with friends.")

    return allowed


def _insert_ignoring_duplicates(sql: str, params: tuple) -> bool:
    """True when a row was added, False when the recipient already had it."""
    return db.execute(sql, params) > 0


def share_quiz(viewer: dict, quiz_id: int, friend_ids: list[int]) -> int:
    """Returns how many people it was newly shared with: re-sharing to someone who already has it
    is a no-op, and does not email them a second time."""
    quiz = quiz_repo.find_quiz_by_id(quiz_id)

    if not quiz or quiz["owner_id"] != viewer["id"]:
        raise ApiError.not_found("No such quiz.")

    if quiz["question_count"] == 0:
        raise ApiError.bad_request("Add at least one question before sharing.")

    config = current_app.config["ALL_AN"]
    shared = 0

    for recipient in _friends_among(viewer, friend_ids):
        added = _insert_ignoring_duplicates(
            """
            INSERT INTO quiz_shares (quiz_id, shared_by_id, shared_with_id) VALUES (%s, %s, %s)
            ON CONFLICT (quiz_id, shared_with_id) DO NOTHING
            """,
            (quiz_id, viewer["id"], recipient["id"]),
        )

        if not added:
            continue

        shared += 1
        link = f"{config.site_url}/quizzes/{quiz_id}/take"
        mail.send(
            config,
            to=recipient["email"],
            subject=f"{viewer['username']} shared a quiz with you: {quiz['title']}",
            text=(
                f'{viewer["username"]} shared the quiz "{quiz["title"]}" ({quiz["subject"]}) '
                f"with you on all-an.\n\nTake it here: {link}\n"
            ),
            html_body=(
                f"<p><strong>{mail.escape_html(viewer['username'])}</strong> shared the quiz "
                f'"{mail.escape_html(quiz["title"])}" ({mail.escape_html(quiz["subject"])}) with you on all-an.</p>'
                f'<p><a href="{link}">Take it here</a></p>'
            ),
        )

    return shared


def share_question(viewer: dict, question_id: int, friend_ids: list[int]) -> int:
    question = quiz_repo.find_question_by_id(question_id)
    quiz = quiz_repo.find_quiz_by_id(question["quiz_id"]) if question else None

    if not question or not quiz or quiz["owner_id"] != viewer["id"]:
        raise ApiError.not_found("No such question.")

    config = current_app.config["ALL_AN"]
    shared = 0

    for recipient in _friends_among(viewer, friend_ids):
        added = _insert_ignoring_duplicates(
            """
            INSERT INTO question_shares (question_id, shared_by_id, shared_with_id) VALUES (%s, %s, %s)
            ON CONFLICT (question_id, shared_with_id) DO NOTHING
            """,
            (question_id, viewer["id"], recipient["id"]),
        )

        if not added:
            continue

        shared += 1
        link = f"{config.site_url}/shared"
        mail.send(
            config,
            to=recipient["email"],
            subject=f"{viewer['username']} shared a question with you",
            text=(
                f'{viewer["username"]} shared a question with you on all-an:\n\n"{question["prompt"]}"\n\n'
                f"Copy it into one of your quizzes: {link}\n"
            ),
            html_body=(
                f"<p><strong>{mail.escape_html(viewer['username'])}</strong> shared a question with you on all-an:</p>"
                f"<blockquote>{mail.escape_html(question['prompt'])}</blockquote>"
                f'<p><a href="{link}">Copy it into one of your quizzes</a></p>'
            ),
        )

    return shared


def list_shared(viewer: dict) -> dict:
    quizzes = db.query(
        """
        SELECT s.id, s.quiz_id, q.title AS quiz_title, q.subject AS quiz_subject,
               f.name AS study_field_name, sender.username AS shared_by_username, s.created_at,
               (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count
        FROM quiz_shares s
        JOIN quizzes q ON q.id = s.quiz_id
        JOIN study_fields f ON f.id = q.study_field_id
        JOIN users sender ON sender.id = s.shared_by_id
        WHERE s.shared_with_id = %s AND s.dismissed_at IS NULL
        ORDER BY s.created_at DESC
        """,
        (viewer["id"],),
    )
    questions = db.query(
        """
        SELECT s.id, s.question_id, q.prompt, q.kind, q.time_limit_seconds,
               sender.username AS shared_by_username, s.created_at, s.copied_at
        FROM question_shares s
        JOIN questions q ON q.id = s.question_id
        JOIN users sender ON sender.id = s.shared_by_id
        WHERE s.shared_with_id = %s AND s.dismissed_at IS NULL
        ORDER BY s.created_at DESC
        """,
        (viewer["id"],),
    )

    return {
        "quizzes": [
            {
                "shareId": r["id"],
                "quizId": r["quiz_id"],
                "title": r["quiz_title"],
                "subject": r["quiz_subject"],
                "studyField": r["study_field_name"],
                "questionCount": r["question_count"],
                "sharedBy": r["shared_by_username"],
                "sharedAt": iso(r["created_at"]),
            }
            for r in quizzes
        ],
        "questions": [
            {
                "shareId": r["id"],
                "questionId": r["question_id"],
                "prompt": r["prompt"],
                "kind": r["kind"],
                "timeLimitSeconds": r["time_limit_seconds"],
                "sharedBy": r["shared_by_username"],
                "sharedAt": iso(r["created_at"]),
                "copied": r["copied_at"] is not None,
            }
            for r in questions
        ],
    }


def copy_shared_question(viewer: dict, share_id: int, target_quiz_id: int) -> int:
    """Copies a shared question - prompt, explanation, timing and every option - onto the end of one
    of the recipient's own quizzes. The copy is independent: editing it does not touch the original."""
    share = db.query_one(
        "SELECT question_id FROM question_shares WHERE id = %s AND shared_with_id = %s",
        (share_id, viewer["id"]),
    )

    if share is None:
        raise ApiError.not_found("No such shared question.")

    source = quiz_repo.find_question_by_id(share["question_id"])

    if source is None:
        raise ApiError.not_found("That question no longer exists.")

    target = quiz_repo.find_quiz_by_id(target_quiz_id)

    if not target or target["owner_id"] != viewer["id"]:
        raise ApiError.not_found("No such quiz.")

    options = [(o["body"], o["is_correct"]) for o in quiz_repo.find_options([source["id"]])]

    with db.transaction() as conn:
        question_id = quiz_repo.insert_question(
            conn,
            target_quiz_id,
            {
                "kind": source["kind"],
                "prompt": source["prompt"],
                "explanation": source["explanation"],
                "time_limit_seconds": source["time_limit_seconds"],
            },
        )
        quiz_repo.replace_options(conn, question_id, options)
        conn.execute("UPDATE question_shares SET copied_at = NOW() WHERE id = %s", (share_id,))

    return question_id


def dismiss_quiz(viewer: dict, share_id: int) -> None:
    """Dismissing hides the share from the recipient's inbox and nothing else - the row stays, so a
    quiz they were already sent keeps being takeable by link, and the sender cannot re-send it."""
    db.execute(
        "UPDATE quiz_shares SET dismissed_at = NOW() WHERE id = %s AND shared_with_id = %s",
        (share_id, viewer["id"]),
    )


def dismiss_question(viewer: dict, share_id: int) -> None:
    db.execute(
        "UPDATE question_shares SET dismissed_at = NOW() WHERE id = %s AND shared_with_id = %s",
        (share_id, viewer["id"]),
    )
