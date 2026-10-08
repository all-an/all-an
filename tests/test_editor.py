import pytest

from all_an import db
from tests.test_quizzes import TECH, mc, new_quiz, sign_in_as

HX = {"HX-Request": "true"}


@pytest.fixture
def alice(browser, make_user):
    make_user("alice")
    return sign_in_as(browser, "alice")


@pytest.fixture
def bob(make_browser, make_user):
    make_user("bob")
    return sign_in_as(make_browser("10.0.0.2"), "bob")


def text(response):
    return response.get_data(as_text=True)


def details(**overrides):
    return {"title": "Rust basics", "studyFieldId": str(TECH), "subject": "Rust",
            "description": "", "defaultTimeLimitSeconds": "30", **overrides}


def question_form(**overrides):
    return {"kind": "MULTIPLE_CHOICE", "prompt": "Which is a Rust web framework?", "timeLimitSeconds": "",
            "explanation": "", "correct": "0", "option_body": ["Axum", "Rails", "Django"], **overrides}


def make_quiz(alice, **kw):
    return new_quiz(alice, **kw)["id"]


# --- the page ----------------------------------------------------------------------------------


def test_the_editor_needs_a_sign_in_and_comes_back_to_the_page(browser):
    response = browser.get("/quizzes/new")

    assert response.status_code == 303 and response.headers["Location"] == "/login?next=/quizzes/new"


def test_a_new_quiz_form_defaults_to_the_first_field_and_30_seconds(alice):
    page = text(alice.get("/quizzes/new"))

    assert "New quiz" in page and 'hx-post="/quizzes"' in page
    assert 'value="30"' in page
    assert "Save the quiz, then add its questions." in page
    assert 'id="questions"' not in page
    assert page.count(" selected>") == 1 and 'value="1" selected' in page  # Languages, the first


def test_the_edit_page_shows_the_saved_values_and_the_questions_region(alice):
    quiz_id = make_quiz(alice, title="Mine", description="About it", shuffleQuestions=True)

    page = text(alice.get(f"/quizzes/{quiz_id}/edit"))

    assert 'value="Mine"' in page and "About it" in page and "checked" in page
    assert f'hx-post="/quizzes/{quiz_id}/details"' in page
    assert "Questions (0)" in page and "No questions yet." in page


def test_saved_notice_comes_from_the_query_and_is_cleared_from_the_address(alice):
    quiz_id = make_quiz(alice)

    assert ">Saved.<" in text(alice.get(f"/quizzes/{quiz_id}/edit?saved=1"))
    assert ">Saved.<" not in text(alice.get(f"/quizzes/{quiz_id}/edit"))


def test_someone_elses_quiz_has_no_editor(alice, bob):
    quiz_id = make_quiz(alice)

    response = bob.get(f"/quizzes/{quiz_id}/edit")

    assert response.status_code == 404 and "No such quiz." in text(response)


# --- the quiz's own fields ---------------------------------------------------------------------


def test_creating_redirects_to_the_edit_page(alice):
    response = alice.post("/quizzes", data=details(), headers=HX)

    quiz = db.query_one("SELECT id, title FROM quizzes WHERE title = 'Rust basics'")
    assert response.status_code == 204
    assert response.headers["HX-Redirect"] == f"/quizzes/{quiz['id']}/edit?saved=1"


def test_a_plain_form_post_creates_and_redirects_without_htmx(alice):
    response = alice.post("/quizzes", data=details())

    assert response.status_code == 303 and response.headers["Location"].endswith("/edit?saved=1")


def test_invalid_details_come_back_as_the_form_with_messages_and_a_notice(alice):
    response = alice.post("/quizzes", data=details(title="", subject="", defaultTimeLimitSeconds="1"), headers=HX)
    body = text(response)

    assert response.status_code == 422
    assert body.lstrip().startswith("<form") and "<html" not in body
    assert "title is required" in body and "subject is required" in body
    assert 'id="editor-notice"' in body and 'hx-swap-oob="true"' in body
    assert "the time limit must be at least 5 seconds" in body
    assert db.query_one("SELECT COUNT(*) AS n FROM quizzes WHERE owner_id IS NOT NULL")["n"] == 0


def test_invalid_details_keep_what_was_typed(alice):
    body = text(alice.post("/quizzes", data=details(title="", subject="Kept <b>", description="Also kept"), headers=HX))

    assert "Also kept" in body and "Kept &lt;b&gt;" in body and "<b>" not in body


def test_saving_details_updates_the_quiz_and_says_saved(alice):
    quiz_id = make_quiz(alice)

    response = alice.post(
        f"/quizzes/{quiz_id}/details",
        data=details(title="Renamed", defaultTimeLimitSeconds="45", shuffleQuestions="on"),
        headers=HX,
    )

    assert response.status_code == 200 and 'value="Renamed"' in text(response) and ">Saved.<" in text(response)
    row = db.query_one("SELECT title, default_time_limit_seconds, shuffle_questions FROM quizzes WHERE id = %s", (quiz_id,))
    assert row == {"title": "Renamed", "default_time_limit_seconds": 45, "shuffle_questions": True}


def test_unchecking_shuffle_turns_it_off(alice):
    quiz_id = make_quiz(alice, shuffleQuestions=True)

    alice.post(f"/quizzes/{quiz_id}/details", data=details(), headers=HX)  # no shuffleQuestions field

    assert db.query_one("SELECT shuffle_questions FROM quizzes WHERE id = %s", (quiz_id,))["shuffle_questions"] is False


def test_nobody_else_can_save_details(alice, bob):
    quiz_id = make_quiz(alice)

    assert bob.post(f"/quizzes/{quiz_id}/details", data=details(title="Hijacked"), headers=HX).status_code == 404
    assert db.query_one("SELECT title FROM quizzes WHERE id = %s", (quiz_id,))["title"] == "Rust basics"


def test_publishing_needs_a_question_and_reports_it_in_the_page_notice(alice):
    quiz_id = make_quiz(alice)

    response = alice.post(f"/quizzes/{quiz_id}/editor/publish", headers=HX)

    assert response.status_code == 400 and response.headers["HX-Retarget"] == "#page-error"
    assert "Add at least one question before publishing." in text(response)


def test_publish_flips_the_button_and_keeps_unsaved_edits(alice):
    quiz_id = make_quiz(alice)
    alice.post(f"/api/quizzes/{quiz_id}/questions", json=mc())

    published = text(alice.post(f"/quizzes/{quiz_id}/editor/publish", data=details(title="Typed, unsaved"), headers=HX))

    assert "Unpublish" in published and "Published to the pool." in published
    assert 'value="Typed, unsaved"' in published
    assert db.query_one("SELECT visibility FROM quizzes WHERE id = %s", (quiz_id,))["visibility"] == "PUBLIC"
    assert db.query_one("SELECT title FROM quizzes WHERE id = %s", (quiz_id,))["title"] == "Rust basics"

    unpublished = text(alice.post(f"/quizzes/{quiz_id}/editor/unpublish", headers=HX))
    assert "Publish to the pool" in unpublished and "Unpublished." in unpublished


# --- the question form -------------------------------------------------------------------------


def test_the_add_form_starts_with_two_choices_and_the_quiz_default_time(alice):
    quiz_id = make_quiz(alice, defaultTimeLimitSeconds=45)

    body = text(alice.get(f"/quizzes/{quiz_id}/question-form", headers=HX))

    assert body.lstrip().startswith('<form id="question-form"')
    assert body.count('name="option_body"') == 2 and body.count('type="radio"') == 2
    assert 'value="45"' in body


def test_switching_to_typed_drops_blank_rows_and_removes_the_radios(alice):
    quiz_id = make_quiz(alice)

    body = text(
        alice.post(
            f"/quizzes/{quiz_id}/question-form/kind",
            data=question_form(option_body=["Axum", "", "Django"], new_kind="TYPED"),
            headers=HX,
        )
    )

    assert body.count('name="option_body"') == 2
    assert 'type="radio"' not in body
    assert "Accepted answers" in body
    assert "Which is a Rust web framework?" in body  # what was typed is not lost


def test_switching_back_to_choices_makes_sure_there_are_two_rows_and_one_answer(alice):
    quiz_id = make_quiz(alice)

    body = text(
        alice.post(
            f"/quizzes/{quiz_id}/question-form/kind",
            data=question_form(kind="TYPED", option_body=["Rust"], correct=None, new_kind="MULTIPLE_CHOICE"),
            headers=HX,
        )
    )

    assert body.count('name="option_body"') == 2 and body.count('type="radio"') == 2
    assert body.count(" checked") == 1


def test_add_and_remove_a_choice(alice):
    quiz_id = make_quiz(alice)

    added = text(alice.post(f"/quizzes/{quiz_id}/question-form/add-option", data=question_form(), headers=HX))
    assert added.count('name="option_body"') == 4

    removed = text(alice.post(f"/quizzes/{quiz_id}/question-form/remove-option", data=question_form(index="1"), headers=HX))
    assert removed.count('name="option_body"') == 2
    assert "Rails" not in removed and "Axum" in removed and "Django" in removed


def test_removing_a_row_keeps_the_right_one_marked_correct(alice):
    quiz_id = make_quiz(alice)

    body = text(
        alice.post(
            f"/quizzes/{quiz_id}/question-form/remove-option", data=question_form(correct="2", index="0"), headers=HX
        )
    )

    # Axum removed; Django (was row 2, now row 1) must still be the checked one.
    assert 'value="1" checked' in body


def test_reshaping_someone_elses_form_is_a_404(alice, bob):
    quiz_id = make_quiz(alice)

    assert bob.post(f"/quizzes/{quiz_id}/question-form/add-option", data=question_form(), headers=HX).status_code == 404
    assert bob.get(f"/quizzes/{quiz_id}/question-form", headers=HX).status_code == 404


def test_cancel_closes_the_form(alice):
    quiz_id = make_quiz(alice)

    assert text(alice.get(f"/quizzes/{quiz_id}/question-form/close", headers=HX)) == '<div id="question-form"></div>'


# --- saving, editing and the list --------------------------------------------------------------


def test_saving_a_question_swaps_in_the_updated_list(alice):
    quiz_id = make_quiz(alice, defaultTimeLimitSeconds=45)

    response = alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(), headers=HX)
    body = text(response)

    assert response.status_code == 200
    assert response.headers["HX-Retarget"] == "#questions" and response.headers["HX-Reswap"] == "outerHTML"
    assert body.lstrip().startswith('<div id="questions">')
    assert "Questions (1)" in body and "Which is a Rust web framework?" in body
    assert "Multiple choice" in body and "45s" in body and "answer: Axum" in body


def test_a_typed_question_lists_every_accepted_answer(alice):
    quiz_id = make_quiz(alice)

    body = text(
        alice.post(
            f"/quizzes/{quiz_id}/questions",
            data={"kind": "TYPED", "prompt": "Colour?", "timeLimitSeconds": "10", "option_body": ["color", "colour"]},
            headers=HX,
        )
    )

    assert "Typed" in body and "10s" in body and "answer: color / colour" in body


def test_too_few_choices_come_back_as_the_form_with_a_message(alice):
    quiz_id = make_quiz(alice)

    response = alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(option_body=["only one"]), headers=HX)
    body = text(response)

    assert response.status_code == 422 and "HX-Retarget" not in response.headers
    assert body.lstrip().startswith("<form") and 'value="only one"' in body
    assert "Add at least two choices." in body
    assert db.query_one("SELECT COUNT(*) AS n FROM questions WHERE quiz_id = %s", (quiz_id,))["n"] == 0


def test_field_errors_on_a_question_name_the_prompt(alice):
    quiz_id = make_quiz(alice)

    body = text(alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(prompt="  "), headers=HX))

    assert "the question is required" in body
    assert db.query_one("SELECT COUNT(*) AS n FROM questions WHERE quiz_id = %s", (quiz_id,))["n"] == 0


def test_the_edit_form_is_filled_in_and_saving_it_changes_the_question(alice):
    quiz_id = make_quiz(alice)
    alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(), headers=HX)
    question_id = db.query_one("SELECT id FROM questions WHERE quiz_id = %s", (quiz_id,))["id"]

    form = text(alice.get(f"/questions/{question_id}/form", headers=HX))
    assert f'name="question_id" value="{question_id}"' in form
    assert 'value="Axum"' in form and 'value="0" checked' in form

    body = text(
        alice.post(
            f"/quizzes/{quiz_id}/questions",
            data=question_form(question_id=str(question_id), prompt="Edited?", correct="1"),
            headers=HX,
        )
    )

    assert "Edited?" in body and "answer: Rails" in body and "Questions (1)" in body


def test_a_stranger_cannot_open_or_save_into_someone_elses_question(alice, bob):
    quiz_id = make_quiz(alice)
    alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(), headers=HX)
    question_id = db.query_one("SELECT id FROM questions WHERE quiz_id = %s", (quiz_id,))["id"]

    assert bob.get(f"/questions/{question_id}/form", headers=HX).status_code == 404
    assert bob.post(f"/quizzes/{quiz_id}/questions", data=question_form(), headers=HX).status_code == 404
    assert bob.post(f"/quizzes/{quiz_id}/questions", data=question_form(question_id=str(question_id), prompt="x"), headers=HX).status_code == 404
    assert bob.post(f"/questions/{question_id}/delete", headers=HX).status_code == 404


def test_move_archive_and_delete_return_the_refreshed_list(alice):
    quiz_id = make_quiz(alice)
    for prompt in ("first", "second", "third"):
        alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(prompt=prompt), headers=HX)
    ids = [r["id"] for r in db.query("SELECT id FROM questions WHERE quiz_id = %s ORDER BY position", (quiz_id,))]

    down = text(alice.post(f"/questions/{ids[0]}/down", headers=HX))
    assert down.index("second") < down.index("first") < down.index("third")

    up = text(alice.post(f"/questions/{ids[2]}/up", headers=HX))
    assert up.index("second") < up.index("third") < up.index("first")

    archived = text(alice.post(f"/questions/{ids[1]}/archive", headers=HX))
    assert 'class="card archived"' in archived and "Unarchive" in archived

    deleted = text(alice.post(f"/questions/{ids[0]}/delete", headers=HX))
    assert "Questions (2)" in deleted and "first" not in deleted


def test_moving_past_either_end_changes_nothing(alice):
    quiz_id = make_quiz(alice)
    for prompt in ("first", "second"):
        alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(prompt=prompt), headers=HX)
    first = db.query_one("SELECT id FROM questions WHERE prompt = 'first'")["id"]

    body = text(alice.post(f"/questions/{first}/up", headers=HX))

    assert body.index("first") < body.index("second")


def test_the_first_and_last_arrows_are_disabled(alice):
    quiz_id = make_quiz(alice)
    for prompt in ("first", "second"):
        alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(prompt=prompt), headers=HX)

    body = text(alice.get(f"/quizzes/{quiz_id}/edit"))

    assert body.count("disabled>↑") + body.count("disabled>↓") == 2


def test_option_text_is_escaped_in_the_form_and_the_list(alice):
    quiz_id = make_quiz(alice)
    payload = '"><script>alert(1)</script>'
    alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(prompt=payload, option_body=[payload, "b"]), headers=HX)
    question_id = db.query_one("SELECT id FROM questions WHERE quiz_id = %s", (quiz_id,))["id"]

    for page in (text(alice.get(f"/quizzes/{quiz_id}/edit")), text(alice.get(f"/questions/{question_id}/form", headers=HX))):
        assert "<script>alert(1)</script>" not in page


def test_unknown_actions_are_a_404(alice):
    quiz_id = make_quiz(alice)
    alice.post(f"/quizzes/{quiz_id}/questions", data=question_form(), headers=HX)
    question_id = db.query_one("SELECT id FROM questions")["id"]

    assert alice.post(f"/questions/{question_id}/explode", headers=HX).status_code == 404
    assert alice.post(f"/quizzes/{quiz_id}/question-form/explode", data=question_form(), headers=HX).status_code == 404
    assert alice.post(f"/quizzes/{quiz_id}/editor/explode", headers=HX).status_code == 404
