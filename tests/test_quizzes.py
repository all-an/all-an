import pytest

from all_an import db

TECH = 4  # study_fields.id for "Technology"


def new_quiz(browser, **overrides):
    body = {"title": "Rust basics", "studyFieldId": TECH, "subject": "Rust", **overrides}
    response = browser.post("/api/quizzes", json=body)
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.json


def mc(prompt="Which is a Rust web framework?", **extra):
    return {
        "kind": "MULTIPLE_CHOICE",
        "prompt": prompt,
        "options": [
            {"body": "Axum", "isCorrect": True},
            {"body": "Rails", "isCorrect": False},
            {"body": "Django", "isCorrect": False},
        ],
        **extra,
    }


def typed(prompt="Name the language", answers=("Rust",), **extra):
    return {"kind": "TYPED", "prompt": prompt, "options": [{"body": a} for a in answers], **extra}


@pytest.fixture
def alice(browser, make_user):
    make_user("alice")
    sign_in_as(browser, "alice")
    return browser


def sign_in_as(browser, username, password="a long enough phrase"):
    response = browser.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return browser


@pytest.fixture
def bob(make_browser, make_user):
    make_user("bob")
    return sign_in_as(make_browser("10.0.0.2"), "bob")


# --- creating and reading ----------------------------------------------------------------------


def test_create_returns_the_quiz_with_defaults_and_an_empty_question_list(alice):
    quiz = new_quiz(alice, description="  hello  ")

    assert quiz["title"] == "Rust basics" and quiz["description"] == "hello"
    assert quiz["owned"] is True and quiz["visibility"] == "PRIVATE"
    assert quiz["defaultTimeLimitSeconds"] == 30 and quiz["shuffleQuestions"] is False
    assert quiz["studyField"] == {"slug": "technology", "name": "Technology"}
    assert quiz["questions"] == [] and quiz["questionCount"] == 0
    assert quiz["createdAt"].endswith("Z")


def test_quiz_validation_messages(alice):
    response = alice.post(
        "/api/quizzes",
        json={"title": " ", "subject": "", "defaultTimeLimitSeconds": 2, "description": "x" * 2001},
    )

    assert response.status_code == 400
    assert response.json["fields"] == {
        "title": "title is required",
        "description": "description must be at most 2000 characters",
        "studyFieldId": "pick a study field",
        "subject": "subject is required",
        "defaultTimeLimitSeconds": "the time limit must be at least 5 seconds",
    }


def test_an_unknown_study_field_is_a_field_error(alice):
    response = alice.post("/api/quizzes", json={"title": "t", "studyFieldId": 999, "subject": "s"})

    assert response.status_code == 400
    assert response.json["fields"] == {"studyFieldId": "Pick a study field from the list."}


def test_a_stranger_cannot_create(browser):
    assert browser.post("/api/quizzes", json={"title": "t"}).status_code == 401


# --- who can see what --------------------------------------------------------------------------


def test_private_quizzes_are_a_404_for_everyone_but_the_owner(alice, bob, browser):
    quiz = new_quiz(alice)

    assert alice.get(f"/api/quizzes/{quiz['id']}").status_code == 200
    assert bob.get(f"/api/quizzes/{quiz['id']}").status_code == 404
    assert bob.get(f"/api/quizzes/{quiz['id']}").json == {"message": "No such quiz."}


def test_published_quizzes_hide_their_questions_from_everyone_but_the_owner(alice, bob):
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())
    alice.patch(f"/api/quizzes/{quiz['id']}/visibility", json={"visibility": "PUBLIC"})

    seen_by_bob = bob.get(f"/api/quizzes/{quiz['id']}").json

    assert seen_by_bob["owned"] is False and "questions" not in seen_by_bob
    assert len(alice.get(f"/api/quizzes/{quiz['id']}").json["questions"]) == 1


def test_a_shared_private_quiz_is_readable_by_the_recipient(alice, bob, make_user):
    quiz = new_quiz(alice)
    bob_id = db.query_one("SELECT id FROM users WHERE username = 'bob'")["id"]
    db.execute(
        "INSERT INTO quiz_shares (quiz_id, shared_by_id, shared_with_id) VALUES (%s, %s, %s)",
        (quiz["id"], db.query_one("SELECT id FROM users WHERE username = 'alice'")["id"], bob_id),
    )

    assert bob.get(f"/api/quizzes/{quiz['id']}").status_code == 200


def test_non_numeric_ids_are_a_json_404(alice):
    response = alice.get("/api/quizzes/abc")

    assert response.status_code == 404 and response.json == {"message": "Not found."}


# --- editing -----------------------------------------------------------------------------------


def test_only_the_author_can_edit_and_others_get_a_404(alice, bob):
    quiz = new_quiz(alice)
    edit = {"title": "Changed", "studyFieldId": TECH, "subject": "Rust"}

    assert alice.put(f"/api/quizzes/{quiz['id']}", json=edit).json["title"] == "Changed"
    assert bob.put(f"/api/quizzes/{quiz['id']}", json=edit).status_code == 404


def test_an_admin_may_delete_a_published_quiz_but_not_edit_it(alice, make_browser, make_user):
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())
    alice.patch(f"/api/quizzes/{quiz['id']}/visibility", json={"visibility": "PUBLIC"})

    make_user("root", role="ADMIN")
    admin = sign_in_as(make_browser("10.0.0.3"), "root")

    edit = admin.put(f"/api/quizzes/{quiz['id']}", json={"title": "x", "studyFieldId": TECH, "subject": "s"})
    assert (edit.status_code, edit.json["message"]) == (403, "Only the author can edit a quiz.")

    assert admin.delete(f"/api/quizzes/{quiz['id']}").status_code == 204
    assert alice.get(f"/api/quizzes/{quiz['id']}").status_code == 404


def test_an_admin_cannot_touch_a_private_quiz(alice, make_browser, make_user):
    quiz = new_quiz(alice)
    make_user("root", role="ADMIN")
    admin = sign_in_as(make_browser("10.0.0.3"), "root")

    assert admin.delete(f"/api/quizzes/{quiz['id']}").status_code == 404


def test_publishing_needs_a_question(alice):
    quiz = new_quiz(alice)

    response = alice.patch(f"/api/quizzes/{quiz['id']}/visibility", json={"visibility": "PUBLIC"})

    assert (response.status_code, response.json["message"]) == (400, "Add at least one question before publishing.")


# --- questions ---------------------------------------------------------------------------------


def test_adding_questions_appends_in_order_and_defaults_the_time_limit(alice):
    quiz = new_quiz(alice, defaultTimeLimitSeconds=45)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())
    detail = alice.post(f"/api/quizzes/{quiz['id']}/questions", json=typed(timeLimitSeconds=5)).json

    first, second = detail["questions"]
    assert (first["position"], first["timeLimitSeconds"], first["kind"]) == (1, 45, "MULTIPLE_CHOICE")
    assert (second["position"], second["timeLimitSeconds"], second["kind"]) == (2, 5, "TYPED")
    assert [o["body"] for o in first["options"]] == ["Axum", "Rails", "Django"]
    assert second["options"] == [{"id": second["options"][0]["id"], "body": "Rust", "isCorrect": True}]


@pytest.mark.parametrize(
    ("payload", "message", "text"),
    [
        (
            {"kind": "MULTIPLE_CHOICE", "prompt": "x", "options": [{"body": "a", "isCorrect": True}]},
            "A multiple-choice question needs at least two choices.",
            "Add at least two choices.",
        ),
        (
            {"kind": "MULTIPLE_CHOICE", "prompt": "x", "options": [{"body": "a"}, {"body": "b"}]},
            "Mark which choice is correct.",
            "Mark at least one choice as correct.",
        ),
        (
            {"kind": "TYPED", "prompt": "x", "options": [{"body": "  "}]},
            "A typed question needs at least one accepted answer.",
            "Add the answer you will accept.",
        ),
    ],
)
def test_question_option_rules(alice, payload, message, text):
    quiz = new_quiz(alice)

    response = alice.post(f"/api/quizzes/{quiz['id']}/questions", json=payload)

    assert response.status_code == 400
    assert response.json["message"] == message
    assert response.json["fields"] == {"options": text}


def test_blank_choices_are_dropped_and_typed_answers_are_all_correct(alice):
    quiz = new_quiz(alice)
    detail = alice.post(
        f"/api/quizzes/{quiz['id']}/questions",
        json={"kind": "TYPED", "prompt": "Colour?", "options": [{"body": "color"}, {"body": ""}, {"body": " colour "}]},
    ).json

    assert [(o["body"], o["isCorrect"]) for o in detail["questions"][0]["options"]] == [("color", True), ("colour", True)]


def test_question_field_validation(alice):
    quiz = new_quiz(alice)

    response = alice.post(
        f"/api/quizzes/{quiz['id']}/questions",
        json={"kind": "NOPE", "prompt": "", "timeLimitSeconds": 9999, "options": []},
    )

    assert response.status_code == 400
    assert response.json["fields"]["kind"] == "pick a question type"
    assert response.json["fields"]["prompt"] == "the question is required"
    assert response.json["fields"]["timeLimitSeconds"] == "the time limit must be at most 10 minutes"


def test_editing_a_question_replaces_its_options(alice):
    quiz = new_quiz(alice)
    created = alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc()).json["questions"][0]

    detail = alice.put(f"/api/questions/{created['id']}", json=typed("Edited?", ["Yes"], explanation="Because")).json
    question = detail["questions"][0]

    assert (question["prompt"], question["kind"], question["explanation"]) == ("Edited?", "TYPED", "Because")
    assert [o["body"] for o in question["options"]] == ["Yes"]


def test_only_the_author_may_change_a_question(alice, bob):
    quiz = new_quiz(alice)
    question = alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc()).json["questions"][0]

    assert bob.put(f"/api/questions/{question['id']}", json=mc()).status_code == 404
    assert bob.delete(f"/api/questions/{question['id']}").status_code == 404
    assert bob.post(f"/api/quizzes/{quiz['id']}/questions", json=mc()).status_code == 404


def test_deleting_a_question_returns_the_quiz(alice):
    quiz = new_quiz(alice)
    first = alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc()).json["questions"][0]
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=typed())

    detail = alice.delete(f"/api/questions/{first['id']}").json

    assert [q["kind"] for q in detail["questions"]] == ["TYPED"]


def test_reordering_requires_an_exact_permutation(alice):
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc("one"))
    ids = [q["id"] for q in alice.post(f"/api/quizzes/{quiz['id']}/questions", json=typed("two")).json["questions"]]

    for bad in ([ids[0]], [ids[0], ids[0]], ids + [99999]):
        response = alice.patch(f"/api/quizzes/{quiz['id']}/order", json={"questionIds": bad})
        assert response.status_code == 400, bad
        assert response.json["message"] == "The new order must list every question in the quiz exactly once."

    detail = alice.patch(f"/api/quizzes/{quiz['id']}/order", json={"questionIds": ids[::-1]}).json
    assert [(q["prompt"], q["position"]) for q in detail["questions"]] == [("two", 1), ("one", 2)]


# --- archiving and lists -----------------------------------------------------------------------


def test_archiving_moves_a_quiz_between_the_active_and_archived_lists(alice):
    quiz = new_quiz(alice)

    assert [q["id"] for q in alice.get("/api/quizzes").json] == [quiz["id"]]
    assert alice.put(f"/api/quizzes/{quiz['id']}/archive").status_code == 204
    assert alice.get("/api/quizzes").json == []
    assert [q["archived"] for q in alice.get("/api/quizzes?archived=true").json] == [True]

    alice.delete(f"/api/quizzes/{quiz['id']}/archive")
    assert [q["id"] for q in alice.get("/api/quizzes").json] == [quiz["id"]]


def test_archives_are_personal(alice, bob):
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())
    alice.patch(f"/api/quizzes/{quiz['id']}/visibility", json={"visibility": "PUBLIC"})

    bob.put(f"/api/quizzes/{quiz['id']}/archive")

    mine = [q["id"] for q in alice.get("/api/quizzes/public").json]
    theirs = [q["id"] for q in bob.get("/api/quizzes/public").json]
    assert quiz["id"] in mine and quiz["id"] not in theirs


def test_public_list_skips_empty_quizzes_and_filters(alice, browser):
    empty = new_quiz(alice, title="Empty")
    full = new_quiz(alice, title="Full", subject="Python")
    alice.post(f"/api/quizzes/{full['id']}/questions", json=mc())
    alice.patch(f"/api/quizzes/{full['id']}/visibility", json={"visibility": "PUBLIC"})

    titles = {q["title"] for q in browser.get("/api/quizzes/public").json}
    assert "Full" in titles and "Empty" not in titles
    assert {q["title"] for q in browser.get("/api/quizzes/public?studyField=technology&subject=Python").json} == {"Full"}
    assert browser.get("/api/quizzes/public?studyField=languages&subject=Python").json == []
    assert len(browser.get("/api/quizzes/public?limit=1").json) == 1
    assert empty["id"]


def test_study_fields_and_subjects(alice, browser):
    fields = browser.get("/api/quizzes/study-fields").json
    assert [f["slug"] for f in fields][:3] == ["languages", "mathematics", "natural-sciences"]
    assert len(fields) == 10

    new_quiz(alice, subject="Zig")
    assert alice.get("/api/quizzes/subjects?scope=mine").json == ["Zig"]
    assert "Zig" not in browser.get("/api/quizzes/subjects").json  # private, so not in the public pool


# --- the pages ---------------------------------------------------------------------------------


def test_browse_lists_the_seeded_quizzes_for_anyone(browser):
    page = browser.get("/quizzes/browse").get_data(as_text=True)

    assert "English verb forms" in page and "Capital cities" in page and "Mental arithmetic" in page
    assert "All quizzes" not in page  # no archive view for a stranger
    assert "Languages (1)" in page


def test_browse_filters_by_field_and_marks_it_selected(browser):
    page = browser.get("/quizzes/browse/languages").get_data(as_text=True)

    assert "English verb forms" in page and "Capital cities" not in page
    assert 'class="chip selected" href="/quizzes/browse"' in page  # click again to clear


def test_browse_chips_are_links_and_boost_into_the_body_region(browser):
    page = browser.get("/quizzes/browse").get_data(as_text=True)

    assert 'hx-select="#browse-body"' in page and 'hx-push-url="true"' in page
    assert 'href="/quizzes/browse/mathematics"' in page


def test_archive_button_swaps_in_the_updated_list(alice):
    page = alice.get("/quizzes/browse").get_data(as_text=True)
    assert "Archive</button>" in page.replace("\n", "").replace("  ", "")

    quiz_id = db.query_one("SELECT id FROM quizzes WHERE title = 'Capital cities'")["id"]
    response = alice.post(
        f"/quizzes/browse/archive/{quiz_id}",
        data={"field": "", "subject": "", "archived": ""},
        headers={"HX-Request": "true"},
    )
    body = response.get_data(as_text=True)

    assert response.status_code == 200 and body.lstrip().startswith('<div id="browse-body"')
    assert "Capital cities" not in body and "English verb forms" in body

    archived = alice.get("/quizzes/browse?archived=1").get_data(as_text=True)
    assert "Capital cities" in archived and "English verb forms" not in archived


def test_my_quizzes_requires_sign_in_and_returns_you_afterwards(browser):
    response = browser.get("/quizzes?field=technology")

    assert response.status_code == 303
    assert response.headers["Location"] == "/login?next=/quizzes%3Ffield%3Dtechnology"


def test_my_quizzes_buttons_swap_the_list_and_keep_the_filters(alice):
    keep = new_quiz(alice, title="Keep")
    gone = new_quiz(alice, title="Delete me")
    state = {"field": "", "subject": "", "archived": ""}
    hx = {"HX-Request": "true"}

    page = alice.get("/quizzes").get_data(as_text=True)
    assert "Keep" in page and "Delete me" in page and 'class="badge private"' in page

    deleted = alice.post(f"/quizzes/{gone['id']}/delete", data=state, headers=hx).get_data(as_text=True)
    assert "Delete me" not in deleted and "Keep" in deleted

    archived = alice.post(f"/quizzes/{keep['id']}/archive", data=state, headers=hx).get_data(as_text=True)
    assert "Keep" not in archived and "Nothing here yet." in archived

    shown = alice.post(
        f"/quizzes/{keep['id']}/unarchive", data={**state, "archived": "1"}, headers=hx
    ).get_data(as_text=True)
    assert "No archived quizzes." in shown


def test_publishing_without_questions_shows_the_error_in_the_page_notice(alice):
    quiz = new_quiz(alice)

    response = alice.post(
        f"/quizzes/{quiz['id']}/publish", data={"field": "", "subject": "", "archived": ""}, headers={"HX-Request": "true"}
    )

    assert response.status_code == 400
    assert response.headers["HX-Retarget"] == "#page-error"
    assert "Add at least one question before publishing." in response.get_data(as_text=True)


def test_someone_elses_quiz_cannot_be_deleted_through_the_page_route(alice, bob):
    quiz = new_quiz(alice)

    response = bob.post(f"/quizzes/{quiz['id']}/delete", data={}, headers={"HX-Request": "true"})

    assert response.status_code == 404
    assert alice.get(f"/api/quizzes/{quiz['id']}").status_code == 200


def test_quiz_titles_are_escaped_in_the_lists(alice):
    new_quiz(alice, title="<script>alert(1)</script>")

    page = alice.get("/quizzes").get_data(as_text=True)

    assert "<script>alert(1)</script>" not in page
    assert "&lt;script&gt;" in page
