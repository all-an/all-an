import re

import pytest

from playwright.sync_api import expect

from all_an import db

pytestmark = pytest.mark.e2e


def go(page, path):
    page.goto(page.base_url + path)


def sign_in(page, make_user, username="alice"):
    make_user(username)
    go(page, "/login")
    page.fill("input[name=username]", username)
    page.fill("input[name=password]", "a long enough phrase")
    page.click("button[type=submit]")
    page.wait_for_url("**/quizzes")


def test_a_wrong_password_shows_the_error_in_place_without_leaving_the_page(page, make_user):
    make_user("alice")
    go(page, "/login")
    page.fill("input[name=username]", "alice")
    page.fill("input[name=password]", "not the right one")

    page.click("button[type=submit]")

    page.wait_for_selector(".form-error")
    assert "do not match" in page.inner_text(".form-error")
    assert page.url.endswith("/login")
    assert page.input_value("input[name=username]") == "alice"  # kept
    assert page.input_value("input[name=password]") == ""  # never echoed


def test_signing_in_follows_next_and_signing_out_returns_home(page, make_user):
    make_user("alice")
    go(page, "/results")  # not signed in: bounced to /login?next=/results
    page.wait_for_url("**/login?next=/results")

    page.fill("input[name=username]", "alice")
    page.fill("input[name=password]", "a long enough phrase")
    page.click("button[type=submit]")
    page.wait_for_url("**/results")

    page.click("text=Sign out")
    page.wait_for_url(re.compile(r"/$"))
    assert page.locator("text=Sign in").count() == 1


def test_building_publishing_and_taking_a_quiz_end_to_end(page, make_user):
    sign_in(page, make_user)

    # --- create the quiz -----------------------------------------------------------------
    page.click("text=New quiz")
    page.wait_for_url("**/quizzes/new")
    page.fill("input[name=title]", "Browser quiz")
    page.fill("input[name=subject]", "Testing")
    page.click("#details button[type=submit]")

    page.wait_for_url(re.compile(r"/quizzes/\d+/edit$"))  # ?saved=1 is tidied out of the address
    assert page.inner_text("#editor-notice") == "Saved."
    quiz_id = int(re.search(r"/quizzes/(\d+)/edit", page.url).group(1))

    # --- add a multiple-choice question; the type switch must not lose the typed prompt --------
    page.click("text=Add question")
    page.wait_for_selector("#question-form form, form#question-form")
    page.fill("#question-form textarea[name=prompt]", "Pick the right one")
    page.click("#question-form button:has-text('Type the answer')")
    page.wait_for_selector("#question-form:has-text('Accepted answers')")
    assert page.input_value("#question-form textarea[name=prompt]") == "Pick the right one"
    page.click("#question-form button:has-text('Multiple choice')")
    page.wait_for_selector("#question-form input[type=radio]")

    rows = page.locator("#question-form input[name=option_body]")
    expect(rows).to_have_count(2)
    page.click("#question-form button:has-text('Add another')")
    expect(rows).to_have_count(3)

    for index, body in enumerate(["Wrong", "Right", "Also wrong"]):
        page.locator("#question-form input[name=option_body]").nth(index).fill(body)
    page.locator("#question-form input[type=radio]").nth(1).check()
    page.click("#question-form button[data-save]")

    page.wait_for_selector("#questions:has-text('Questions (1)')")
    assert "answer: Right" in page.inner_text("#questions")
    assert page.locator("#question-form form, form#question-form").count() == 0  # form closed

    # --- a bad question keeps the form open with its message ---------------------------------
    page.click("text=Add question")
    page.wait_for_selector("form#question-form")
    page.click("#question-form button[data-save]")
    page.wait_for_selector("#question-form .field-error")
    assert "the question is required" in page.inner_text("#question-form")
    page.click("#question-form button:has-text('Cancel')")
    page.wait_for_function("!document.querySelector('form#question-form')")

    # --- publish -----------------------------------------------------------------------------
    page.click("text=Publish to the pool")
    page.wait_for_selector("#details button:has-text('Unpublish')")
    assert page.inner_text("#editor-notice") == "Published to the pool."

    # --- take it -----------------------------------------------------------------------------
    go(page, f"/quizzes/{quiz_id}/take")
    page.wait_for_url(re.compile(r"/quizzes/attempt/\d+$"))
    page.wait_for_selector("#runner .prompt")
    assert page.inner_text("#runner .prompt") == "Pick the right one"

    # the countdown runs
    first = page.inner_text("#clock")
    page.wait_for_timeout(1400)
    assert page.inner_text("#clock") != first

    page.click("label.choice:has-text('Right')")
    page.click("#answer-form button[type=submit]")
    page.wait_for_selector(".verdict.right")
    assert "Correct" in page.inner_text(".verdict")

    page.click("text=See results")
    page.wait_for_url(re.compile(r"/results/\d+$"))
    assert "1 / 1" in page.inner_text(".score") and "100%" in page.inner_text(".score")
    assert page.js_errors == []


def test_the_countdown_submits_for_you_when_it_reaches_zero(page, make_user):
    sign_in(page, make_user)
    from tests.test_quizzes import typed

    from all_an import users

    owner = users.find_by_username("alice")
    quiz_id = db.query_one(
        "INSERT INTO quizzes (owner_id, title, study_field_id, subject) VALUES (%s, 'Clock', 4, 'T') RETURNING id",
        (owner["id"],),
    )["id"]
    question_id = db.query_one(
        "INSERT INTO questions (quiz_id, position, kind, prompt, time_limit_seconds) "
        "VALUES (%s, 1, 'TYPED', 'Quick', 5) RETURNING id",
        (quiz_id,),
    )["id"]
    db.execute("INSERT INTO question_options (question_id, position, body, is_correct) VALUES (%s, 1, 'x', TRUE)", (question_id,))

    go(page, f"/quizzes/{quiz_id}/take")
    page.wait_for_selector("#runner .prompt")

    # Do nothing. At zero the page submits the empty answer by itself.
    page.wait_for_selector(".verdict", timeout=9000)

    assert "Not quite" in page.inner_text(".verdict")
    assert "x" in page.inner_text(".verdict")


def test_filter_chips_swap_the_list_and_update_the_address(page):
    go(page, "/quizzes/browse")
    expect(page.locator("article")).to_have_count(3)
    page.evaluate("window.__marker = 'same page'")

    page.click("a.chip:has-text('Languages')")

    page.wait_for_url("**/quizzes/browse/languages")
    expect(page.locator("article")).to_have_count(1)
    assert "English verb forms" in page.inner_text("#browse-body")
    assert page.evaluate("window.__marker") == "same page"  # swapped in place, not reloaded

    page.click("a.chip.selected:has-text('Languages')")  # again to clear
    page.wait_for_url("**/quizzes/browse")
    page.wait_for_function("document.querySelectorAll('article').length === 3")


def test_my_quizzes_buttons_update_the_list_in_place(page, make_user):
    sign_in(page, make_user)
    from all_an import users

    owner = users.find_by_username("alice")
    for title in ("Keep me", "Archive me", "Delete me"):
        db.execute(
            "INSERT INTO quizzes (owner_id, title, study_field_id, subject) VALUES (%s, %s, 4, 'T')",
            (owner["id"], title),
        )
    go(page, "/quizzes")
    assert page.locator("article").count() == 3

    page.click("article:has-text('Delete me') >> button:text-is('Delete')")
    page.wait_for_function("document.querySelectorAll('article').length === 2")

    page.click("article:has-text('Archive me') >> button:text-is('Archive')")
    page.wait_for_function("document.querySelectorAll('article').length === 1")
    assert "Keep me" in page.inner_text("#mine-body")

    page.click("a.chip:has-text('Archived')")
    page.wait_for_selector("article:has-text('Archive me')")
    assert "Keep me" not in page.inner_text("#mine-body")

    # An error from the server lands in the page notice, not in the list.
    page.click("a.chip:has-text('Active')")
    page.wait_for_selector("article:has-text('Keep me')")
    page.click("article:has-text('Keep me') >> button:text-is('Publish')")
    page.wait_for_selector("#page-error .flash-error")
    assert "Add at least one question before publishing." in page.inner_text("#page-error")
    assert "Keep me" in page.inner_text("#mine-body")


def test_deleting_a_result_asks_first_and_updates_the_list(page, make_user):
    sign_in(page, make_user)
    from all_an import users

    owner = users.find_by_username("alice")
    for _ in range(2):
        db.execute("INSERT INTO attempts (user_id, quiz_title_snapshot) VALUES (%s, 'Old run')", (owner["id"],))
    go(page, "/results")
    expect(page.locator(".attempt-row")).to_have_count(2)

    seen = []
    page.on("dialog", lambda d: seen.append(d.message))
    page.click(".attempt-row >> nth=0 >> button:text-is('Delete')")

    page.wait_for_function("document.querySelectorAll('.attempt-row').length === 1")
    assert seen and "Old run" in seen[0]
    assert page.js_errors == []
