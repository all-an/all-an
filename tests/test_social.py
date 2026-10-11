from datetime import UTC, datetime, timedelta

import pytest

from all_an import db
from all_an.messages import CONTACT_EMAIL, start_of_today_utc
from tests.test_quizzes import mc, new_quiz, sign_in_as, typed

HX = {"HX-Request": "true"}


def text(response):
    return response.get_data(as_text=True)


@pytest.fixture
def alice(browser, make_user):
    make_user("alice")
    return sign_in_as(browser, "alice")


# --- the contact form --------------------------------------------------------------------------


def test_sending_a_message(browser):
    response = browser.post("/api/messages", json={"name": " Ada ", "email": "", "body": " hello "})

    assert response.status_code == 201 and response.json["createdAt"].endswith("Z")
    row = db.query_one("SELECT ip, name, email, body FROM messages")
    assert row == {"ip": "10.0.0.1", "name": "Ada", "email": None, "body": "hello"}


def test_one_message_a_day_per_address_and_the_error_names_the_inbox(browser):
    browser.post("/api/messages", json={"body": "first"})

    second = browser.post("/api/messages", json={"body": "second"})

    assert second.status_code == 429
    assert second.json == {"message": "This address has already sent a message today.", "contactEmail": CONTACT_EMAIL}


def test_a_message_from_yesterday_does_not_count(browser):
    browser.post("/api/messages", json={"body": "first"})
    db.execute("UPDATE messages SET created_at = %s", (start_of_today_utc() - timedelta(seconds=1),))

    assert browser.post("/api/messages", json={"body": "second"}).status_code == 201


def test_other_addresses_are_unaffected(make_browser):
    make_browser("10.1.1.1").post("/api/messages", json={"body": "a"})

    assert make_browser("10.1.1.2").post("/api/messages", json={"body": "b"}).status_code == 201


def test_message_validation(browser):
    response = browser.post("/api/messages", json={"name": "x" * 81, "email": "nope", "body": "  "})

    assert response.status_code == 400
    assert response.json["fields"] == {
        "name": "name must be at most 80 characters",
        "email": "email is not a valid address",
        "body": "message is required",
    }
    assert db.query_one("SELECT COUNT(*) AS n FROM messages")["n"] == 0


def test_the_day_boundary_is_utc_midnight():
    assert start_of_today_utc(datetime(2026, 10, 4, 23, 59, 59, tzinfo=UTC)) == datetime(2026, 10, 4, tzinfo=UTC)


def test_the_message_page_posts_and_swaps_in_the_thanks(browser):
    page = text(browser.get("/message"))
    assert 'hx-post="/message"' in page and "placeholder=\" \"" in page

    body = text(browser.post("/message", data={"body": "Hello there"}, headers=HX))

    assert "Got it — thank you!" in body and "<html" not in body
    assert db.query_one("SELECT body FROM messages")["body"] == "Hello there"


def test_a_second_page_message_swaps_in_the_warm_limit_note(browser):
    browser.post("/message", data={"body": "one"}, headers=HX)

    response = browser.post("/message", data={"body": "two"}, headers=HX)

    assert response.status_code == 429
    assert "Thanks for writing again!" in text(response) and f"mailto:{CONTACT_EMAIL}" in text(response)


def test_an_invalid_page_message_keeps_the_text_and_explains(browser):
    response = browser.post("/message", data={"email": "nope", "body": "Keep this"}, headers=HX)

    assert response.status_code == 422
    assert "email is not a valid address" in text(response) and "Keep this" in text(response)
    assert db.query_one("SELECT COUNT(*) AS n FROM messages")["n"] == 0


def test_message_text_is_escaped_when_it_comes_back(browser):
    response = browser.post("/message", data={"email": "nope", "body": "<script>x</script>"}, headers=HX)

    assert "<script>x</script>" not in text(response)


# --- settings and admin ------------------------------------------------------------------------


@pytest.fixture
def admin(make_user, make_browser):
    make_user("root", role="ADMIN")
    return sign_in_as(make_browser("10.0.0.50"), "root")


def test_anyone_can_read_the_settings(browser):
    assert browser.get("/api/settings").json == {"registrationEnabled": True}


def test_only_an_admin_can_write_them(make_browser, alice, admin):
    visitor = make_browser("10.0.0.60")

    assert visitor.put("/api/settings", json={"registrationEnabled": False}).status_code == 401
    assert alice.put("/api/settings", json={"registrationEnabled": False}).status_code == 403

    assert admin.put("/api/settings", json={"registrationEnabled": False}).json == {"registrationEnabled": False}
    assert visitor.get("/api/settings").json == {"registrationEnabled": False}


def test_settings_must_be_a_real_boolean(admin):
    for bad in ({}, {"registrationEnabled": "false"}, {"registrationEnabled": 0}, []):
        assert admin.put("/api/settings", json=bad).status_code == 400, bad


def test_the_admin_records_who_changed_a_setting(admin):
    admin.put("/api/settings", json={"registrationEnabled": False})

    row = db.query_one("SELECT u.username FROM app_settings s JOIN users u ON u.id = s.updated_by")
    assert row["username"] == "root"


def test_the_admin_page_is_for_admins_only(make_browser, alice, admin):
    assert make_browser("10.0.0.60").get("/admin").headers["Location"] == "/login?next=/admin"
    assert alice.get("/admin").headers["Location"] == "/"
    assert admin.get("/admin").status_code == 200


def test_the_admin_form_saves_and_says_what_changed(admin, make_browser):
    browser = make_browser("10.0.0.60")
    page = text(admin.get("/admin"))
    assert "Open" in page and "checked" in page

    closed = text(admin.post("/admin/settings", data={}, headers=HX))  # unchecked sends nothing
    assert "Saved. New accounts are closed." in closed and "Closed" in closed
    assert "New accounts are closed for now" in text(browser.get("/register"))

    opened = text(admin.post("/admin/settings", data={"registrationEnabled": "on"}, headers=HX))
    assert "Saved. Anyone can create an account." in opened


def test_a_non_admin_cannot_post_the_admin_form(alice):
    response = alice.post("/admin/settings", data={}, headers=HX)

    assert response.status_code == 204 and response.headers["HX-Redirect"] == "/"  # sent away, not saved
    assert db.query_one("SELECT value FROM app_settings WHERE key = 'registration_enabled'")["value"] == "true"


# --- the small pages ---------------------------------------------------------------------------


def test_about_front_and_favicon(browser):
    assert "Aubay Portugal" in text(browser.get("/about")) and "HTMX" in text(browser.get("/about"))
    assert "Aubay Portugal" in text(browser.get("/"))  # the front page is the about page
    assert browser.get("/favicon.ico").status_code == 200


def test_the_nav_hides_the_link_to_the_current_page(browser):
    assert 'href="/about" class="is-active"' in text(browser.get("/about"))
    assert 'href="/about" class="is-active"' in text(browser.get("/"))
    assert 'href="/about" class="is-active"' not in text(browser.get("/message"))
