"""Quiz persistence: SQL in, dict rows out. The rules about who may do what live in service.py."""

from .. import db

_QUIZ_COLUMNS = """
  q.id, q.owner_id, q.title, q.description, q.study_field_id,
  f.slug AS study_field_slug, f.name AS study_field_name,
  q.subject, q.visibility, q.default_time_limit_seconds, q.shuffle_questions, q.created_at,
  (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count"""

_FROM = "FROM quizzes q JOIN study_fields f ON f.id = q.study_field_id"

# For lookups that are not about anyone's archive. `archived` is a constant so the row has the same
# shape either way.
_QUIZ_SELECT = f"SELECT {_QUIZ_COLUMNS}, FALSE AS archived {_FROM}"

# For lists, where %(viewer)s is the viewer and `archived` says whether they have set the quiz aside.
_QUIZ_SELECT_WITH_ARCHIVE = f"""
  SELECT {_QUIZ_COLUMNS},
         EXISTS (SELECT 1 FROM quiz_archives za
                 WHERE za.quiz_id = q.id AND za.user_id = %(viewer)s) AS archived
  {_FROM}"""


def find_quiz_by_id(quiz_id: int) -> dict | None:
    return db.query_one(f"{_QUIZ_SELECT} WHERE q.id = %s", (quiz_id,))


def find_quizzes_by_owner(owner_id: int, study_field: str | None, subject: str | None, archived: bool):
    return db.query(
        f"""{_QUIZ_SELECT_WITH_ARCHIVE}
        WHERE q.owner_id = %(viewer)s
          AND (%(field)s::text IS NULL OR f.slug = %(field)s)
          AND (%(subject)s::text IS NULL OR q.subject = %(subject)s)
          AND EXISTS (SELECT 1 FROM quiz_archives za
                      WHERE za.quiz_id = q.id AND za.user_id = %(viewer)s) = %(archived)s
        ORDER BY q.created_at DESC""",
        {"viewer": owner_id, "field": study_field, "subject": subject, "archived": archived},
    )


def find_public_quizzes(
    viewer_id: int | None,
    study_field: str | None,
    subject: str | None,
    limit: int,
    offset: int,
    archived: bool,
):
    """Published quizzes with at least one question: a quiz nobody can take is not worth listing."""
    return db.query(
        f"""{_QUIZ_SELECT_WITH_ARCHIVE}
        WHERE q.visibility = 'PUBLIC'
          AND (%(field)s::text IS NULL OR f.slug = %(field)s)
          AND (%(subject)s::text IS NULL OR q.subject = %(subject)s)
          AND EXISTS (SELECT 1 FROM questions WHERE quiz_id = q.id)
          AND EXISTS (SELECT 1 FROM quiz_archives za
                      WHERE za.quiz_id = q.id AND za.user_id = %(viewer)s) = %(archived)s
        ORDER BY q.created_at DESC
        LIMIT %(limit)s OFFSET %(offset)s""",
        {
            "viewer": viewer_id,
            "field": study_field,
            "subject": subject,
            "archived": archived,
            "limit": limit,
            "offset": offset,
        },
    )


def insert_quiz(owner_id: int, f: dict) -> int:
    row = db.query_one(
        """
        INSERT INTO quizzes
          (owner_id, title, description, study_field_id, subject,
           default_time_limit_seconds, shuffle_questions)
        VALUES (%(owner)s, %(title)s, %(description)s, %(study_field_id)s, %(subject)s,
                %(limit)s, %(shuffle)s)
        RETURNING id
        """,
        {"owner": owner_id, **_quiz_params(f)},
    )
    return row["id"]


def update_quiz(quiz_id: int, f: dict) -> None:
    db.execute(
        """
        UPDATE quizzes
        SET title = %(title)s, description = %(description)s, study_field_id = %(study_field_id)s,
            subject = %(subject)s, default_time_limit_seconds = %(limit)s,
            shuffle_questions = %(shuffle)s, updated_at = NOW()
        WHERE id = %(id)s
        """,
        {"id": quiz_id, **_quiz_params(f)},
    )


def _quiz_params(f: dict) -> dict:
    return {
        "title": f["title"],
        "description": f["description"],
        "study_field_id": f["study_field_id"],
        "subject": f["subject"],
        "limit": f["default_time_limit_seconds"],
        "shuffle": f["shuffle_questions"],
    }


def update_visibility(quiz_id: int, visibility: str) -> None:
    db.execute(
        "UPDATE quizzes SET visibility = %s, updated_at = NOW() WHERE id = %s", (visibility, quiz_id)
    )


def delete_quiz(quiz_id: int) -> None:
    db.execute("DELETE FROM quizzes WHERE id = %s", (quiz_id,))


# --- questions and options ---------------------------------------------------------------------

_QUESTION_COLUMNS = "id, quiz_id, position, kind, prompt, explanation, time_limit_seconds"


def find_questions(quiz_id: int) -> list[dict]:
    return db.query(
        f"SELECT {_QUESTION_COLUMNS} FROM questions WHERE quiz_id = %s ORDER BY position", (quiz_id,)
    )


def find_question_by_id(question_id: int) -> dict | None:
    return db.query_one(f"SELECT {_QUESTION_COLUMNS} FROM questions WHERE id = %s", (question_id,))


def find_options(question_ids: list[int]) -> list[dict]:
    if not question_ids:
        return []

    return db.query(
        """
        SELECT id, question_id, position, body, is_correct
        FROM question_options WHERE question_id = ANY(%s) ORDER BY question_id, position
        """,
        (question_ids,),
    )


def insert_question(conn, quiz_id: int, q: dict) -> int:
    """Appends to the end: position is one past the current maximum, so two questions added in a
    row never collide on the (quiz_id, position) unique constraint."""
    row = conn.execute(
        """
        INSERT INTO questions (quiz_id, position, kind, prompt, explanation, time_limit_seconds)
        VALUES (%(quiz)s, COALESCE((SELECT MAX(position) + 1 FROM questions WHERE quiz_id = %(quiz)s), 1),
                %(kind)s, %(prompt)s, %(explanation)s, %(limit)s)
        RETURNING id
        """,
        {
            "quiz": quiz_id,
            "kind": q["kind"],
            "prompt": q["prompt"],
            "explanation": q["explanation"],
            "limit": q["time_limit_seconds"],
        },
    ).fetchone()
    return row["id"]


def update_question_fields(conn, question_id: int, q: dict) -> None:
    conn.execute(
        """
        UPDATE questions SET kind = %s, prompt = %s, explanation = %s, time_limit_seconds = %s
        WHERE id = %s
        """,
        (q["kind"], q["prompt"], q["explanation"], q["time_limit_seconds"], question_id),
    )


def replace_options(conn, question_id: int, options: list[tuple[str, bool]]) -> None:
    """Replaces a question's options wholesale. Editing is delete-and-reinsert because option ids
    are not something the client holds on to - a finished attempt keeps its own snapshot of what
    was asked, so renumbering here rewrites no history."""
    conn.execute("DELETE FROM question_options WHERE question_id = %s", (question_id,))

    for index, (body, is_correct) in enumerate(options, start=1):
        conn.execute(
            "INSERT INTO question_options (question_id, position, body, is_correct) "
            "VALUES (%s, %s, %s, %s)",
            (question_id, index, body, is_correct),
        )


def delete_question(question_id: int) -> None:
    db.execute("DELETE FROM questions WHERE id = %s", (question_id,))


def reorder_questions(conn, quiz_id: int, question_ids: list[int]) -> None:
    """Parks every question at a negative position, then flips them all positive. Writing the final
    positions directly would trip the (quiz_id, position) unique constraint partway through - two
    rows briefly claiming the same slot."""
    for index, question_id in enumerate(question_ids, start=1):
        conn.execute(
            "UPDATE questions SET position = %s WHERE id = %s AND quiz_id = %s",
            (-index, question_id, quiz_id),
        )

    conn.execute(
        "UPDATE questions SET position = -position WHERE quiz_id = %s AND position < 0", (quiz_id,)
    )


# --- archives ----------------------------------------------------------------------------------


def archive_quiz(user_id: int, quiz_id: int) -> None:
    db.execute(
        "INSERT INTO quiz_archives (user_id, quiz_id) VALUES (%s, %s) "
        "ON CONFLICT (user_id, quiz_id) DO NOTHING",
        (user_id, quiz_id),
    )


def unarchive_quiz(user_id: int, quiz_id: int) -> None:
    db.execute("DELETE FROM quiz_archives WHERE user_id = %s AND quiz_id = %s", (user_id, quiz_id))


def archive_question(user_id: int, question_id: int) -> None:
    db.execute(
        "INSERT INTO question_archives (user_id, question_id) VALUES (%s, %s) "
        "ON CONFLICT (user_id, question_id) DO NOTHING",
        (user_id, question_id),
    )


def unarchive_question(user_id: int, question_id: int) -> None:
    db.execute(
        "DELETE FROM question_archives WHERE user_id = %s AND question_id = %s",
        (user_id, question_id),
    )


def find_archived_question_ids(user_id: int, question_ids: list[int]) -> set[int]:
    if not question_ids:
        return set()

    rows = db.query(
        "SELECT question_id FROM question_archives WHERE user_id = %s AND question_id = ANY(%s)",
        (user_id, question_ids),
    )
    return {row["question_id"] for row in rows}


# --- study fields and subjects -----------------------------------------------------------------


def find_study_fields() -> list[dict]:
    return db.query(
        """
        SELECT f.id, f.slug, f.name,
               COUNT(q.id) FILTER (
                 WHERE q.visibility = 'PUBLIC'
                   AND EXISTS (SELECT 1 FROM questions WHERE quiz_id = q.id)
               ) AS public_quiz_count
        FROM study_fields f
        LEFT JOIN quizzes q ON q.study_field_id = f.id
        GROUP BY f.id, f.slug, f.name, f.position
        ORDER BY f.position
        """
    )


def study_field_exists(field_id: int) -> bool:
    return db.query_one(
        "SELECT EXISTS (SELECT 1 FROM study_fields WHERE id = %s) AS e", (field_id,)
    )["e"]


def find_public_subjects(study_field: str | None) -> list[str]:
    rows = db.query(
        """
        SELECT DISTINCT q.subject
        FROM quizzes q
        JOIN study_fields f ON f.id = q.study_field_id
        WHERE q.visibility = 'PUBLIC'
          AND (%(field)s::text IS NULL OR f.slug = %(field)s)
          AND EXISTS (SELECT 1 FROM questions WHERE quiz_id = q.id)
        ORDER BY q.subject
        """,
        {"field": study_field},
    )
    return [row["subject"] for row in rows]


def find_own_subjects(owner_id: int) -> list[str]:
    rows = db.query(
        "SELECT DISTINCT subject FROM quizzes WHERE owner_id = %s ORDER BY subject", (owner_id,)
    )
    return [row["subject"] for row in rows]
