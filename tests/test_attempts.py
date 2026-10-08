import pytest

from all_an import db
from tests.test_quizzes import mc, new_quiz, sign_in_as, typed

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


def quiz_with(alice, *questions, public=False, **quiz):
    quiz_id = new_quiz(alice, **quiz)["id"]
    for question in questions:
        assert alice.post(f"/api/quizzes/{quiz_id}/questions", json=question).status_code == 201
    if public:
        alice.patch(f"/api/quizzes/{quiz_id}/visibility", json={"visibility": "PUBLIC"})
    return quiz_id


def start(browser, quiz_id):
    response = browser.post("/api/attempts", json={"quizId": quiz_id})
    assert response.status_code == 201, text(response)
    return response.json["attemptId"]


def option_id(browser, attempt_id, body):
    return next(o["id"] for o in browser.get(f"/api/attempts/{attempt_id}/current").json["options"] if o["body"] == body)


def age_current_question(seconds):
    """Pretend the open question was served `seconds` ago, on the database's own clock."""
    db.execute(
        "UPDATE attempt_questions SET served_at = NOW() - make_interval(secs => %s) "
        "WHERE answered_at IS NULL AND served_at IS NOT NULL",
        (seconds,),
    )


# --- starting ----------------------------------------------------------------------------------


def test_starting_snapshots_the_questions(alice):
    quiz_id = quiz_with(alice, mc("one"), typed("two"))

    attempt_id = start(alice, quiz_id)
    rows = db.query("SELECT position, prompt_snapshot FROM attempt_questions WHERE attempt_id = %s ORDER BY position", (attempt_id,))

    assert [(r["position"], r["prompt_snapshot"]) for r in rows] == [(1, "one"), (2, "two")]
    assert db.query_one("SELECT quiz_title_snapshot FROM attempts WHERE id = %s", (attempt_id,))["quiz_title_snapshot"] == "Rust basics"


def test_a_quiz_with_no_questions_cannot_be_started(alice):
    response = alice.post("/api/attempts", json={"quizId": new_quiz(alice)["id"]})

    assert (response.status_code, response.json["message"]) == (400, "That quiz has no questions yet.")


def test_you_cannot_take_someone_elses_private_quiz(alice, bob):
    quiz_id = quiz_with(alice, mc())

    assert bob.post("/api/attempts", json={"quizId": quiz_id}).status_code == 404
    assert alice.post("/api/attempts", json={"quizId": quiz_id}).status_code == 201


def test_anyone_signed_in_can_take_a_published_quiz(alice, bob):
    quiz_id = quiz_with(alice, mc(), public=True)

    assert bob.post("/api/attempts", json={"quizId": quiz_id}).status_code == 201


def test_a_shared_private_quiz_can_be_taken_by_its_recipient(alice, bob):
    quiz_id = quiz_with(alice, mc())
    db.execute(
        "INSERT INTO quiz_shares (quiz_id, shared_by_id, shared_with_id) "
        "SELECT %s, a.id, b.id FROM users a, users b WHERE a.username = 'alice' AND b.username = 'bob'",
        (quiz_id,),
    )

    assert bob.post("/api/attempts", json={"quizId": quiz_id}).status_code == 201


def test_archived_questions_are_left_out_and_all_archived_is_an_error(alice):
    quiz_id = quiz_with(alice, mc("keep"), mc("learned"))
    ids = {q["prompt"]: q["id"] for q in alice.get(f"/api/quizzes/{quiz_id}").json["questions"]}

    alice.put(f"/api/questions/{ids['learned']}/archive")
    attempt_id = start(alice, quiz_id)
    assert alice.get(f"/api/attempts/{attempt_id}").json["total"] == 1

    alice.put(f"/api/questions/{ids['keep']}/archive")
    response = alice.post("/api/attempts", json={"quizId": quiz_id})
    assert response.status_code == 400 and "archived every question" in response.json["message"]


def test_a_bad_quiz_id_is_a_field_error(alice):
    response = alice.post("/api/attempts", json={"quizId": "nope"})

    assert response.status_code == 400 and "quizId" in response.json["fields"]


# --- serving a question ------------------------------------------------------------------------


def test_the_current_question_never_says_which_choice_is_right(alice):
    attempt_id = start(alice, quiz_with(alice, mc()))

    current = alice.get(f"/api/attempts/{attempt_id}/current").json

    assert current["kind"] == "MULTIPLE_CHOICE" and current["position"] == 1 and current["total"] == 1
    assert sorted(o["body"] for o in current["options"]) == ["Axum", "Django", "Rails"]
    assert all(set(o) == {"id", "body"} for o in current["options"])
    assert 29_000 < current["remainingMs"] <= 30_000


def test_a_typed_question_has_no_options_at_all(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))

    assert "options" not in alice.get(f"/api/attempts/{attempt_id}/current").json


def test_reloading_mid_question_does_not_reset_the_clock(alice):
    attempt_id = start(alice, quiz_with(alice, mc(timeLimitSeconds=30)))
    alice.get(f"/api/attempts/{attempt_id}/current")

    age_current_question(12)
    again = alice.get(f"/api/attempts/{attempt_id}/current").json

    assert 17_000 < again["remainingMs"] <= 18_000


def test_other_peoples_attempts_do_not_exist(alice, bob):
    attempt_id = start(alice, quiz_with(alice, mc()))

    for method, url in (("get", "/current"), ("post", "/finish"), ("get", ""), ("delete", "")):
        assert getattr(bob, method)(f"/api/attempts/{attempt_id}{url}").status_code == 404
    assert bob.post(f"/api/attempts/{attempt_id}/answer", json={"text": "x"}).status_code == 404


# --- answering and marking ---------------------------------------------------------------------


def test_a_correct_multiple_choice_answer(alice):
    attempt_id = start(alice, quiz_with(alice, mc(explanation="By the Tokio team.")))

    verdict = alice.post(f"/api/attempts/{attempt_id}/answer", json={"optionId": option_id(alice, attempt_id, "Axum")}).json

    assert verdict == {
        "correct": True, "timedOut": False, "correctAnswer": "Axum",
        "explanation": "By the Tokio team.", "finished": True,
    }


def test_a_wrong_choice_and_no_choice_are_both_wrong(alice):
    quiz_id = quiz_with(alice, mc("one"), mc("two"))
    attempt_id = start(alice, quiz_id)

    wrong = alice.post(f"/api/attempts/{attempt_id}/answer", json={"optionId": option_id(alice, attempt_id, "Rails")}).json
    assert wrong["correct"] is False and wrong["correctAnswer"] == "Axum" and wrong["finished"] is False

    alice.get(f"/api/attempts/{attempt_id}/current")
    assert alice.post(f"/api/attempts/{attempt_id}/answer", json={}).json["correct"] is False


def test_typed_answers_ignore_case_spaces_and_full_stops(alice):
    attempt_id = start(alice, quiz_with(alice, typed(answers=("Rust", "rustlang"))))
    alice.get(f"/api/attempts/{attempt_id}/current")

    assert alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "  RUSTLANG. "}).json["correct"] is True


def test_a_late_answer_is_wrong_even_when_it_is_right(alice):
    attempt_id = start(alice, quiz_with(alice, typed(timeLimitSeconds=5)))
    alice.get(f"/api/attempts/{attempt_id}/current")
    age_current_question(8)  # the limit plus more than the two-second grace

    verdict = alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "Rust"}).json

    assert verdict["correct"] is False and verdict["timedOut"] is True
    assert verdict["correctAnswer"] == "Rust"


def test_the_grace_period_forgives_a_little_latency(alice):
    attempt_id = start(alice, quiz_with(alice, typed(timeLimitSeconds=5)))
    alice.get(f"/api/attempts/{attempt_id}/current")
    age_current_question(6)  # one second late, inside the grace

    assert alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "Rust"}).json["correct"] is True


def test_an_answer_that_arrives_before_the_question_was_served_still_has_a_clock(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))

    verdict = alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "Rust"}).json

    assert verdict["correct"] is True
    assert db.query_one("SELECT served_at IS NOT NULL AS s FROM attempt_questions")["s"] is True


def test_answers_are_recorded_with_timing(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))
    alice.get(f"/api/attempts/{attempt_id}/current")
    age_current_question(3)
    alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "Rust"})

    row = db.query_one("SELECT is_correct, timed_out, elapsed_ms, given_text FROM attempt_questions")

    assert row["is_correct"] is True and row["timed_out"] is False and row["given_text"] == "Rust"
    assert 3_000 <= row["elapsed_ms"] < 5_000


def test_answering_a_finished_attempt_is_an_error(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))
    alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "Rust"})

    response = alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "Rust"})

    assert (response.status_code, response.json["message"]) == (400, "That attempt is already finished.")


def test_an_answer_longer_than_500_characters_is_refused(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))

    response = alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "x" * 501})

    assert response.status_code == 400 and response.json["fields"] == {"text": "that answer is too long"}


def test_finishing_marks_the_attempt_and_current_then_says_finished(alice):
    attempt_id = start(alice, quiz_with(alice, typed(), typed("two")))
    alice.get(f"/api/attempts/{attempt_id}/current")

    assert alice.post(f"/api/attempts/{attempt_id}/finish").status_code == 204
    assert db.query_one("SELECT finished_at IS NOT NULL AS f FROM attempts WHERE id = %s", (attempt_id,))["f"] is True


def test_a_deleted_question_is_skipped_not_fatal(alice):
    quiz_id = quiz_with(alice, typed("gone"), typed("stays"))
    attempt_id = start(alice, quiz_id)
    gone = next(q["id"] for q in alice.get(f"/api/quizzes/{quiz_id}").json["questions"] if q["prompt"] == "gone")
    alice.delete(f"/api/questions/{gone}")

    current = alice.get(f"/api/attempts/{attempt_id}/current").json

    assert current["prompt"] == "stays" and current["position"] == 2
    result = alice.get(f"/api/attempts/{attempt_id}").json
    assert result["questions"][0]["isCorrect"] is False and result["questions"][0]["correctAnswer"] is None


# --- results -----------------------------------------------------------------------------------


def test_results_show_what_you_said_and_the_answer(alice):
    attempt_id = start(alice, quiz_with(alice, mc("pick"), typed("type")))
    alice.post(f"/api/attempts/{attempt_id}/answer", json={"optionId": option_id(alice, attempt_id, "Rails")})
    alice.get(f"/api/attempts/{attempt_id}/current")
    alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "Rust"})

    result = alice.get(f"/api/attempts/{attempt_id}").json

    assert (result["total"], result["answered"], result["correct"]) == (2, 2, 1)
    assert result["finishedAt"] is not None
    first, second = result["questions"]
    assert (first["yourAnswer"], first["correctAnswer"], first["isCorrect"]) == ("Rails", "Axum", False)
    assert (second["yourAnswer"], second["correctAnswer"], second["isCorrect"]) == ("Rust", "Rust", True)


def test_history_lists_newest_first_and_delete_removes_one(alice):
    quiz_id = quiz_with(alice, typed())
    first, second = start(alice, quiz_id), start(alice, quiz_id)

    assert [a["id"] for a in alice.get("/api/attempts").json] == [second, first]
    assert alice.delete(f"/api/attempts/{first}").status_code == 204
    assert [a["id"] for a in alice.get("/api/attempts").json] == [second]
    assert alice.delete(f"/api/attempts/{first}").status_code == 404


def test_deleting_a_quiz_keeps_old_results(alice):
    quiz_id = quiz_with(alice, typed())
    attempt_id = start(alice, quiz_id)
    alice.post(f"/api/attempts/{attempt_id}/answer", json={"text": "Rust"})

    alice.delete(f"/api/quizzes/{quiz_id}")
    result = alice.get(f"/api/attempts/{attempt_id}").json

    assert result["quizTitle"] == "Rust basics" and result["quizId"] is None
    assert result["questions"][0]["prompt"] == "Name the language"


# --- the pages ---------------------------------------------------------------------------------


def test_the_take_page_posts_itself_and_has_a_no_script_button(alice):
    quiz_id = quiz_with(alice, typed())

    page = text(alice.get(f"/quizzes/{quiz_id}/take"))

    assert f'hx-post="/quizzes/{quiz_id}/start"' in page and 'hx-trigger="load"' in page
    assert "<noscript>" in page


def test_visiting_the_take_link_does_not_start_an_attempt(alice):
    quiz_id = quiz_with(alice, typed())

    alice.get(f"/quizzes/{quiz_id}/take")

    assert db.query_one("SELECT COUNT(*) AS n FROM attempts")["n"] == 0


def test_starting_redirects_to_the_runner(alice):
    quiz_id = quiz_with(alice, typed())

    response = alice.post(f"/quizzes/{quiz_id}/start", headers=HX)

    attempt = db.query_one("SELECT id FROM attempts")
    assert response.status_code == 204 and response.headers["HX-Redirect"] == f"/quizzes/attempt/{attempt['id']}"


def test_starting_a_quiz_you_cannot_take_shows_why_in_place(alice, bob):
    quiz_id = quiz_with(alice, typed())

    response = bob.post(f"/quizzes/{quiz_id}/start", headers=HX)

    assert response.status_code == 422
    assert "No such quiz." in text(response) and "Back to my quizzes" in text(response)


def test_the_runner_page_loads_its_first_question_itself(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))

    page = text(alice.get(f"/quizzes/attempt/{attempt_id}"))

    assert f'hx-get="/attempts/{attempt_id}/question"' in page and 'id="runner"' in page
    assert "runner.js" in page


def test_someone_elses_runner_is_a_404(alice, bob):
    attempt_id = start(alice, quiz_with(alice, typed()))

    assert bob.get(f"/quizzes/attempt/{attempt_id}").status_code == 404


def test_the_question_fragment_carries_the_countdown_and_the_choices(alice):
    attempt_id = start(alice, quiz_with(alice, mc(timeLimitSeconds=30)))

    body = text(alice.get(f"/attempts/{attempt_id}/question", headers=HX))

    assert body.lstrip().startswith('<div class="runner" id="runner"') and "<html" not in body
    assert 'data-limit="30"' in body and 'data-countdown="' in body
    assert body.count('type="radio"') == 3 and 'name="option_id"' in body
    assert "Question 1 of 1" in body
    assert "is_correct" not in body and "isCorrect" not in body


def test_a_typed_question_renders_a_text_box(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))

    body = text(alice.get(f"/attempts/{attempt_id}/question", headers=HX))

    assert 'name="text"' in body and 'type="radio"' not in body


def test_answering_swaps_in_a_verdict_with_next_and_learned(alice):
    attempt_id = start(alice, quiz_with(alice, typed("one"), typed("two")))
    alice.get(f"/attempts/{attempt_id}/question", headers=HX)

    wrong = text(alice.post(f"/attempts/{attempt_id}/answer", data={"text": "Python"}, headers=HX))

    assert "Not quite" in wrong and "The answer was <strong>Rust</strong>" in wrong
    assert f'hx-get="/attempts/{attempt_id}/question"' in wrong and "Next question" in wrong
    assert "I've learned this" in wrong and "hx-post=\"/questions/" in wrong


def test_the_last_verdict_links_to_the_results(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))
    alice.get(f"/attempts/{attempt_id}/question", headers=HX)

    right = text(alice.post(f"/attempts/{attempt_id}/answer", data={"text": "rust"}, headers=HX))

    assert "Correct" in right and f'href="/results/{attempt_id}"' in right and "See results" in right


def test_a_timeout_says_out_of_time(alice):
    attempt_id = start(alice, quiz_with(alice, typed(timeLimitSeconds=5)))
    alice.get(f"/attempts/{attempt_id}/question", headers=HX)
    age_current_question(9)

    assert "Out of time" in text(alice.post(f"/attempts/{attempt_id}/answer", data={"text": "Rust"}, headers=HX))


def test_after_the_last_answer_the_question_url_redirects_to_results(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))
    alice.post(f"/attempts/{attempt_id}/answer", data={"text": "Rust"}, headers=HX)

    response = alice.get(f"/attempts/{attempt_id}/question", headers=HX)

    assert response.status_code == 204 and response.headers["HX-Redirect"] == f"/results/{attempt_id}"


def test_giving_up_goes_to_the_results(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))

    response = alice.post(f"/attempts/{attempt_id}/finish", headers=HX)

    assert response.headers["HX-Redirect"] == f"/results/{attempt_id}"
    assert db.query_one("SELECT finished_at IS NOT NULL AS f FROM attempts")["f"] is True


def test_marking_a_question_learned_keeps_it_out_of_the_next_attempt(alice):
    quiz_id = quiz_with(alice, typed("one"), typed("two"))
    attempt_id = start(alice, quiz_id)
    alice.get(f"/attempts/{attempt_id}/question", headers=HX)
    verdict_question = db.query_one("SELECT q.id FROM questions q WHERE q.prompt = 'one'")["id"]

    note = text(alice.post(f"/questions/{verdict_question}/learned", headers=HX))

    assert "you won't be asked this again" in note.replace("&#39;", "'")
    assert alice.get(f"/api/attempts/{start(alice, quiz_id)}").json["total"] == 1


def test_results_page_renders_each_question_with_a_right_or_wrong_marker(alice):
    attempt_id = start(alice, quiz_with(alice, typed("one"), typed("two")))
    alice.post(f"/attempts/{attempt_id}/answer", data={"text": "Rust"}, headers=HX)
    alice.post(f"/attempts/{attempt_id}/answer", data={"text": "wrong"}, headers=HX)

    page = text(alice.get(f"/results/{attempt_id}"))

    assert "1 / 2" in page and "50%" in page
    assert "answer-row right" in page and "answer-row wrong" in page
    assert "Take it again" in page and "Rust basics" in page


def test_an_unanswered_question_reads_not_answered(alice):
    attempt_id = start(alice, quiz_with(alice, typed()))

    assert "not answered" in text(alice.get(f"/results/{attempt_id}"))


def test_the_results_page_for_someone_elses_attempt_is_a_404(alice, bob):
    attempt_id = start(alice, quiz_with(alice, typed()))

    assert bob.get(f"/results/{attempt_id}").status_code == 404


def test_history_page_and_delete_swap(alice):
    quiz_id = quiz_with(alice, typed())
    first, second = start(alice, quiz_id), start(alice, quiz_id)

    page = text(alice.get("/results"))
    assert f'href="/results/{first}"' in page and "unfinished" in page and "hx-confirm='Delete this result?" in page
    assert "<time" in page and "data-date" in page

    swapped = text(alice.post(f"/results/{first}/delete", headers=HX))
    assert swapped.lstrip().startswith('<div id="history-body">')
    assert f'href="/results/{first}"' not in swapped and f'href="/results/{second}"' in swapped

    empty = text(alice.post(f"/results/{second}/delete", headers=HX))
    assert "You have not taken a quiz yet." in empty


def test_you_cannot_delete_someone_elses_result(alice, bob):
    attempt_id = start(alice, quiz_with(alice, typed()))

    assert bob.post(f"/results/{attempt_id}/delete", headers=HX).status_code == 404
    assert db.query_one("SELECT COUNT(*) AS n FROM attempts")["n"] == 1


def test_quiz_text_is_escaped_in_the_runner_and_results(alice):
    payload = "<img src=x onerror=alert(1)>"
    attempt_id = start(alice, quiz_with(alice, typed(prompt=payload)))

    for page in (
        text(alice.get(f"/attempts/{attempt_id}/question", headers=HX)),
        text(alice.get(f"/results/{attempt_id}")),
        text(alice.get("/results")),
    ):
        assert payload not in page
