"""Sharing quizzes and questions with friends. Filled out in Phase 6; the quiz rules only need to
know whether a quiz was shared with someone."""

from . import db


def is_quiz_shared_with(quiz_id: int, user_id: int) -> bool:
    row = db.query_one(
        "SELECT EXISTS (SELECT 1 FROM quiz_shares WHERE quiz_id = %s AND shared_with_id = %s) AS e",
        (quiz_id, user_id),
    )
    return row["e"]
