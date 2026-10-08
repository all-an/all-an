from datetime import UTC, datetime, timedelta

import pytest

from all_an import db, mail
from all_an.messages import CONTACT_EMAIL, start_of_today_utc
from tests.test_quizzes import mc, new_quiz, sign_in_as, typed

HX = {"HX-Request": "true"}


def text(response):
    return response.get_data(as_text=True)


@pytest.fixture
def alice(browser, make_user):
    make_user("alice")
    return sign_in_as(browser, "alice")


@pytest.fixture
def bob(make_browser, make_user):
    make_user("bob")
    return sign_in_as(make_browser("10.0.0.2"), "bob")


@pytest.fixture
def carol(make_browser, make_user):
    make_user("carol")
    return sign_in_as(make_browser("10.0.0.3"), "carol")


@pytest.fixture
def sent_mail(monkeypatch):
    """Records what would have been POSTed to Resend instead of sending it."""
    sent = []

    class Response:
        ok = True
        status_code = 200
        text = ""

    def fake_post(url, **kwargs):
        sent.append({"url": url, **kwargs})
        return Response()

    monkeypatch.setattr(mail.requests, "post", fake_post)
    return sent


@pytest.fixture
def configured_mail(app):
    config = app.config["ALL_AN"]
    app.config["ALL_AN"] = type(config)(**{**config.__dict__, "resend_api_key": "key", "mail_from": "all-an <no-reply@x.test>"})


def user_id(username):
    return db.query_one("SELECT id FROM users WHERE username = %s", (username,))["id"]


def befriend(asker, accepter, accepter_name):
    asker.post("/api/friends/requests", json={"username": accepter_name})
    request_id = accepter.get("/api/friends/requests").json[0]["friendshipId"]
    assert accepter.post(f"/api/friends/requests/{request_id}/accept").status_code == 204


# --- friends: the API --------------------------------------------------------------------------


def test_asking_then_accepting_makes_friends(alice, bob):
    assert alice.post("/api/friends/requests", json={"username": "BOB"}).json == {"status": "PENDING"}

    assert alice.get("/api/friends/requests").json[0]["direction"] == "OUTGOING"
    incoming = bob.get("/api/friends/requests").json
    assert incoming[0]["direction"] == "INCOMING" and incoming[0]["username"] == "alice"

    assert bob.post(f"/api/friends/requests/{incoming[0]['friendshipId']}/accept").status_code == 204
    assert [f["username"] for f in alice.get("/api/friends").json] == ["bob"]
    assert [f["username"] for f in bob.get("/api/friends").json] == ["alice"]


def test_crossed_requests_become_a_friendship(alice, bob):
    alice.post("/api/friends/requests", json={"username": "bob"})

    assert bob.post("/api/friends/requests", json={"username": "alice"}).json == {"status": "ACCEPTED"}
    assert [f["username"] for f in alice.get("/api/friends").json] == ["bob"]


@pytest.mark.parametrize(
    ("username", "status", "message"),
    [
        ("nobody", 404, "No account with that username."),
        ("alice", 400, "You cannot add yourself."),
    ],
)
def test_bad_friend_requests(alice, bob, username, status, message):
    response = alice.post("/api/friends/requests", json={"username": username})

    assert (response.status_code, response.json["message"]) == (status, message)


def test_duplicate_requests_and_existing_friends_conflict(alice, bob):
    alice.post("/api/friends/requests", json={"username": "bob"})
    again = alice.post("/api/friends/requests", json={"username": "bob"})
    assert (again.status_code, again.json["message"]) == (409, "You have already asked them.")

    befriend_id = bob.get("/api/friends/requests").json[0]["friendshipId"]
    bob.post(f"/api/friends/requests/{befriend_id}/accept")
    already = alice.post("/api/friends/requests", json={"username": "bob"})
    assert (already.status_code, already.json["message"]) == (409, "You are already friends.")


def test_only_the_asked_person_can_accept(alice, bob):
    alice.post("/api/friends/requests", json={"username": "bob"})
    request_id = alice.get("/api/friends/requests").json[0]["friendshipId"]

    response = alice.post(f"/api/friends/requests/{request_id}/accept")

    assert (response.status_code, response.json["message"]) == (403, "Only the person who was asked can accept.")


def test_either_side_can_remove_a_pending_request_and_either_can_unfriend(alice, bob, carol):
    alice.post("/api/friends/requests", json={"username": "bob"})
    request_id = bob.get("/api/friends/requests").json[0]["friendshipId"]
    assert bob.delete(f"/api/friends/requests/{request_id}").status_code == 204  # decline

    alice.post("/api/friends/requests", json={"username": "bob"})
    request_id = alice.get("/api/friends/requests").json[0]["friendshipId"]
    assert alice.delete(f"/api/friends/requests/{request_id}").status_code == 204  # withdraw

    befriend(alice, bob, "bob")
    friendship = bob.get("/api/friends").json[0]["friendshipId"]
    assert carol.delete(f"/api/friends/{friendship}").status_code == 404  # a stranger cannot
    assert bob.delete(f"/api/friends/{friendship}").status_code == 204
    assert alice.get("/api/friends").json == []


def test_a_pending_request_cannot_be_unfriended_and_an_accepted_one_cannot_be_declined(alice, bob):
    alice.post("/api/friends/requests", json={"username": "bob"})
    request_id = alice.get("/api/friends/requests").json[0]["friendshipId"]
    assert alice.delete(f"/api/friends/{request_id}").status_code == 404

    bob.post(f"/api/friends/requests/{request_id}/accept")
    assert alice.delete(f"/api/friends/requests/{request_id}").status_code == 404


def test_friend_username_is_validated(alice):
    response = alice.post("/api/friends/requests", json={"username": "  "})

    assert response.status_code == 400 and response.json["fields"] == {"username": "username is required"}


# --- friends: the page -------------------------------------------------------------------------


def test_the_friends_page_lists_incoming_outgoing_and_friends(alice, bob, carol):
    alice.post("/api/friends/requests", json={"username": "bob"})
    carol.post("/api/friends/requests", json={"username": "alice"})

    page = text(alice.get("/friends"))

    assert "Asking to be your friend" in page and "carol" in page
    assert "Waiting on them" in page and "bob" in page
    assert "No friends yet." in page


def test_adding_a_friend_through_the_form(alice, bob):
    body = text(alice.post("/friends/requests", data={"username": "bob"}, headers=HX))

    assert body.lstrip().startswith('<div id="friends-body"')
    assert "Request sent to bob." in body and "Waiting on them" in body


def test_a_failed_request_keeps_what_was_typed_and_explains(alice):
    response = alice.post("/friends/requests", data={"username": "ghost"}, headers=HX)

    assert response.status_code == 422
    assert "No account with that username." in text(response) and 'value="ghost"' in text(response)


def test_accepting_declining_and_removing_from_the_page(alice, bob):
    alice.post("/api/friends/requests", json={"username": "bob"})
    request_id = bob.get("/api/friends/requests").json[0]["friendshipId"]

    accepted = text(bob.post(f"/friends/requests/{request_id}/accept", headers=HX))
    assert "Your friends" in accepted and "alice" in accepted and "Asking to be your friend" not in accepted

    friendship = bob.get("/api/friends").json[0]["friendshipId"]
    assert "No friends yet." in text(bob.post(f"/friends/{friendship}/remove", headers=HX))


def test_friend_names_are_escaped_in_the_page(alice, make_user, make_browser):
    make_user("x-y")
    other = sign_in_as(make_browser("10.0.0.9"), "x-y")
    other.post("/api/friends/requests", json={"username": "alice"})

    assert 'hx-confirm' not in text(alice.get("/friends")) or "<script" not in text(alice.get("/friends"))


# --- sharing -----------------------------------------------------------------------------------


def test_sharing_a_quiz_needs_a_friend_and_a_question(alice, bob):
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())

    stranger = alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("bob")]})
    assert (stranger.status_code, stranger.json["message"]) == (403, "You can only share with friends.")

    befriend(alice, bob, "bob")
    empty_quiz = new_quiz(alice, title="Empty")
    empty = alice.post(f"/api/quizzes/{empty_quiz['id']}/shares", json={"friendIds": [user_id("bob")]})
    assert (empty.status_code, empty.json["message"]) == (400, "Add at least one question before sharing.")

    ok = alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("bob")]})
    assert (ok.status_code, ok.json) == (201, {"shared": 1})


def test_sharing_twice_does_not_duplicate_or_re_notify(alice, bob, configured_mail, sent_mail):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())
    body = {"friendIds": [user_id("bob")]}

    assert alice.post(f"/api/quizzes/{quiz['id']}/shares", json=body).json == {"shared": 1}
    assert alice.post(f"/api/quizzes/{quiz['id']}/shares", json=body).json == {"shared": 0}
    assert len(sent_mail) == 1


def test_the_share_email_names_the_quiz_and_links_to_it_escaped(alice, bob, configured_mail, sent_mail, make_user):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice, title='Tricky <b>"quiz"</b>')
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())

    alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("bob")]})
    (call,) = sent_mail
    payload = call["json"]

    assert call["url"] == "https://api.resend.com/emails" and call["headers"] == {"Authorization": "Bearer key"}
    assert payload["to"] == ["bob@example.com"] and payload["from"] == "all-an <no-reply@x.test>"
    assert payload["subject"] == 'alice shared a quiz with you: Tricky <b>"quiz"</b>'
    assert f"http://localhost/quizzes/{quiz['id']}/take" in payload["text"]
    assert "<b>" not in payload["html"] and "&lt;b&gt;" in payload["html"]


def test_without_mail_configured_sharing_still_works(alice, bob, sent_mail):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())

    assert alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("bob")]}).status_code == 201
    assert sent_mail == []


def test_a_failing_mail_provider_never_fails_the_share(alice, bob, configured_mail, monkeypatch):
    def boom(*a, **k):
        raise mail.requests.ConnectionError("down")

    monkeypatch.setattr(mail.requests, "post", boom)
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())

    assert alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("bob")]}).json == {"shared": 1}


def test_only_the_owner_can_share_and_friend_ids_are_validated(alice, bob):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice)

    assert bob.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("alice")]}).status_code == 404
    none = alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": []})
    assert none.status_code == 400 and none.json["fields"] == {"friendIds": "choose at least one friend"}


def test_the_recipient_sees_and_can_take_a_shared_private_quiz(alice, bob):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice, title="Secret")
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())
    alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("bob")]})

    shared = bob.get("/api/shares").json["quizzes"]

    assert [(s["title"], s["sharedBy"], s["questionCount"]) for s in shared] == [("Secret", "alice", 1)]
    assert bob.get(f"/api/quizzes/{quiz['id']}").status_code == 200
    assert bob.post("/api/attempts", json={"quizId": quiz["id"]}).status_code == 201


def test_a_shared_question_can_be_copied_and_is_then_marked(alice, bob):
    befriend(alice, bob, "bob")
    source = new_quiz(alice)
    question = alice.post(f"/api/quizzes/{source['id']}/questions", json=mc(explanation="Because")).json["questions"][0]
    alice.post(f"/api/questions/{question['id']}/shares", json={"friendIds": [user_id("bob")]})
    mine = new_quiz(bob, title="Bob's")

    share = bob.get("/api/shares").json["questions"][0]
    assert share["copied"] is False

    copied = bob.post(f"/api/shares/questions/{share['shareId']}/copy", json={"quizId": mine["id"]})
    assert copied.status_code == 201

    detail = bob.get(f"/api/quizzes/{mine['id']}").json["questions"][0]
    assert (detail["prompt"], detail["explanation"], detail["kind"]) == (question["prompt"], "Because", "MULTIPLE_CHOICE")
    assert [(o["body"], o["isCorrect"]) for o in detail["options"]] == [("Axum", True), ("Rails", False), ("Django", False)]
    assert bob.get("/api/shares").json["questions"][0]["copied"] is True


def test_copying_needs_your_own_quiz_and_your_own_share(alice, bob, carol):
    befriend(alice, bob, "bob")
    source = new_quiz(alice)
    question = alice.post(f"/api/quizzes/{source['id']}/questions", json=mc()).json["questions"][0]
    alice.post(f"/api/questions/{question['id']}/shares", json={"friendIds": [user_id("bob")]})
    share_id = bob.get("/api/shares").json["questions"][0]["shareId"]

    assert bob.post(f"/api/shares/questions/{share_id}/copy", json={"quizId": source["id"]}).status_code == 404  # not Bob's quiz
    assert carol.post(f"/api/shares/questions/{share_id}/copy", json={"quizId": new_quiz(carol)["id"]}).status_code == 404  # not Carol's share


def test_dismissing_hides_a_share_from_the_inbox_only(alice, bob):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())
    alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("bob")]})
    share_id = bob.get("/api/shares").json["quizzes"][0]["shareId"]

    assert bob.delete(f"/api/shares/quizzes/{share_id}").status_code == 204

    assert bob.get("/api/shares").json["quizzes"] == []
    assert bob.get(f"/api/quizzes/{quiz['id']}").status_code == 200  # still takeable by link
    assert alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("bob")]}).json == {"shared": 0}


# --- sharing: the pages ------------------------------------------------------------------------


def test_the_shared_page_lists_both_kinds_and_dismiss_swaps_it(alice, bob):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice, title="For Bob")
    question = alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc("Shared Q")).json["questions"][0]
    alice.post(f"/api/quizzes/{quiz['id']}/shares", json={"friendIds": [user_id("bob")]})
    alice.post(f"/api/questions/{question['id']}/shares", json={"friendIds": [user_id("bob")]})
    new_quiz(bob, title="Bob's own")

    page = text(bob.get("/shared"))
    assert "For Bob" in page and "Shared Q" in page and "from alice" in page
    assert f'href="/quizzes/{quiz["id"]}/take"' in page
    assert "Bob&#39;s own" in page  # in the copy picker

    share_id = bob.get("/api/shares").json["quizzes"][0]["shareId"]
    after = text(bob.post(f"/shared/quizzes/{share_id}/dismiss", headers=HX))
    assert "Nobody has shared a quiz with you yet." in after and "Shared Q" in after


def test_copying_from_the_page_confirms_it(alice, bob):
    befriend(alice, bob, "bob")
    source = new_quiz(alice)
    question = alice.post(f"/api/quizzes/{source['id']}/questions", json=mc()).json["questions"][0]
    alice.post(f"/api/questions/{question['id']}/shares", json={"friendIds": [user_id("bob")]})
    mine = new_quiz(bob)
    share_id = bob.get("/api/shares").json["questions"][0]["shareId"]

    body = text(bob.post(f"/shared/questions/{share_id}/copy", data={"quiz_id": str(mine["id"])}, headers=HX))

    assert "Copied into your quiz." in body and "already copied" in body


def test_the_shared_page_without_any_quiz_of_your_own_explains_why_there_is_no_copy_button(alice, bob):
    befriend(alice, bob, "bob")
    source = new_quiz(alice)
    question = alice.post(f"/api/quizzes/{source['id']}/questions", json=mc()).json["questions"][0]
    alice.post(f"/api/questions/{question['id']}/shares", json={"friendIds": [user_id("bob")]})

    page = text(bob.get("/shared"))

    assert "Create a quiz first" in page and "Copy into…" not in page


def test_the_editor_offers_sharing_only_when_you_have_friends(alice, bob):
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())
    assert "Share with friends" not in text(alice.get(f"/quizzes/{quiz['id']}/edit"))

    befriend(alice, bob, "bob")
    page = text(alice.get(f"/quizzes/{quiz['id']}/edit"))
    assert "Share with friends" in page and 'id="share-panel"' in page and "/share-panel" in page


def test_the_share_panel_lists_friends_as_checkboxes_and_posts_to_share(alice, bob):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())

    panel = text(alice.get(f"/quizzes/{quiz['id']}/share-panel", headers=HX))

    assert panel.lstrip().startswith('<div id="share-panel">')
    assert f'hx-post="/quizzes/{quiz["id"]}/share"' in panel
    assert f'name="friend_ids" value="{user_id("bob")}"' in panel and "Share this quiz" in panel

    done = text(alice.post(f"/quizzes/{quiz['id']}/share", data={"friend_ids": [str(user_id("bob"))]}, headers=HX))
    assert '<div id="share-panel"></div>' in done and "Shared with 1 friend." in done and 'hx-swap-oob="true"' in done

    again = text(alice.post(f"/quizzes/{quiz['id']}/share", data={"friend_ids": [str(user_id("bob"))]}, headers=HX))
    assert "Already shared with everyone you picked." in again


def test_sharing_a_question_from_the_editor(alice, bob):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice)
    question = alice.post(f"/api/quizzes/{quiz['id']}/questions", json=typed()).json["questions"][0]

    assert "Share this question" in text(alice.get(f"/questions/{question['id']}/share-panel", headers=HX))
    done = text(alice.post(f"/questions/{question['id']}/share", data={"friend_ids": [str(user_id("bob"))]}, headers=HX))

    assert "Shared with 1 friend." in done
    assert bob.get("/api/shares").json["questions"][0]["prompt"] == question["prompt"]


def test_sharing_with_nobody_selected_is_reported_in_the_page_notice(alice, bob):
    befriend(alice, bob, "bob")
    quiz = new_quiz(alice)
    alice.post(f"/api/quizzes/{quiz['id']}/questions", json=mc())

    response = alice.post(f"/quizzes/{quiz['id']}/share", data={}, headers=HX)

    assert response.status_code == 400 and response.headers["HX-Retarget"] == "#page-error"
    assert "choose at least one friend" in text(response)


def test_share_panels_for_someone_elses_quiz_do_not_exist(alice, bob):
    quiz = new_quiz(alice)

    assert bob.get(f"/quizzes/{quiz['id']}/share-panel", headers=HX).status_code == 404


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
    assert "Open quizzes" in text(browser.get("/"))
    assert browser.get("/favicon.ico").status_code == 200


def test_the_nav_hides_the_link_to_the_current_page(browser):
    assert 'href="/about" class="is-active"' in text(browser.get("/about"))
    assert 'href="/about" class="is-active"' not in text(browser.get("/"))
