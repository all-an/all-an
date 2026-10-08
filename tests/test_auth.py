import pytest

from all_an import db

GOOD = {"username": "alice", "email": "alice@example.com", "password": "a long enough phrase"}


def test_register_logs_you_in(browser):
    response = browser.post("/api/auth/register", json=GOOD)

    assert response.status_code == 201
    assert response.json == {"id": response.json["id"], "username": "alice", "email": "alice@example.com", "role": "USER"}

    me = browser.get("/api/auth/me")
    assert me.status_code == 200 and me.json["username"] == "alice"


def test_the_session_cookie_is_httponly_and_only_its_hash_is_stored(browser):
    response = browser.post("/api/auth/register", json=GOOD)
    cookie = next(c for c in response.headers.getlist("Set-Cookie") if c.startswith("sid="))
    token = cookie.split(";")[0].split("=", 1)[1]

    assert "HttpOnly" in cookie and "SameSite=Lax" in cookie
    assert db.query_one("SELECT COUNT(*) AS n FROM sessions WHERE id = %s", (token,))["n"] == 0
    assert db.query_one("SELECT COUNT(*) AS n FROM sessions")["n"] == 1


def test_register_validates_every_field(browser):
    response = browser.post("/api/auth/register", json={"username": "a", "email": "x", "password": "short"})

    assert response.status_code == 400
    assert response.json["message"] == "That request was not valid."
    assert set(response.json["fields"]) == {"username", "email", "password"}
    assert response.json["fields"]["password"] == "password must be at least 8 characters"


def test_usernames_and_emails_are_unique_ignoring_case(browser):
    browser.post("/api/auth/register", json=GOOD)
    other = browser.__class__(browser.client.application, "10.0.0.2")

    taken = other.post("/api/auth/register", json={**GOOD, "username": "ALICE", "email": "b@example.com"})
    assert (taken.status_code, taken.json["message"]) == (409, "That username is taken.")

    same_email = other.post("/api/auth/register", json={**GOOD, "username": "bob", "email": "ALICE@example.com"})
    assert (same_email.status_code, same_email.json["message"]) == (
        409,
        "That email address already has an account.",
    )


def test_login_with_any_case_and_wrong_password_is_the_same_failure_as_unknown_user(browser, make_user):
    make_user()

    wrong = browser.post("/api/auth/login", json={"username": "alice", "password": "not the password"})
    unknown = browser.post("/api/auth/login", json={"username": "nobody", "password": "not the password"})

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json == unknown.json == {"message": "That username and password do not match."}

    ok = browser.post("/api/auth/login", json={"username": "ALICE", "password": "a long enough phrase"})
    assert ok.status_code == 200


def test_logout_ends_the_session_server_side(browser, make_user):
    make_user()
    sign_in_response = browser.post("/api/auth/login", json={"username": "alice", "password": "a long enough phrase"})
    assert sign_in_response.status_code == 200

    assert browser.post("/api/auth/logout").status_code == 204
    assert browser.get("/api/auth/me").status_code == 401
    assert db.query_one("SELECT COUNT(*) AS n FROM sessions")["n"] == 0


def test_a_stolen_cookie_stops_working_once_the_session_row_is_gone(browser, make_user):
    make_user()
    browser.post("/api/auth/login", json={"username": "alice", "password": "a long enough phrase"})
    assert browser.get("/api/auth/me").status_code == 200

    db.execute("DELETE FROM sessions")
    assert browser.get("/api/auth/me").status_code == 401


def test_expired_sessions_do_not_count(browser, make_user):
    make_user()
    browser.post("/api/auth/login", json={"username": "alice", "password": "a long enough phrase"})
    db.execute("UPDATE sessions SET expires_at = NOW() - INTERVAL '1 second'")

    assert browser.get("/api/auth/me").status_code == 401


def test_five_failed_logins_lock_the_address_out_and_say_for_how_long(browser, make_user):
    make_user()

    for _ in range(5):
        browser.post("/api/auth/login", json={"username": "alice", "password": "wrong password!"})

    blocked = browser.post("/api/auth/login", json={"username": "alice", "password": "a long enough phrase"})

    assert blocked.status_code == 429
    assert blocked.json["message"] == "Too many failed sign-ins from this address. Try again shortly."
    assert 800 <= blocked.json["retryAfterSeconds"] <= 900
    assert blocked.headers["Retry-After"] == str(blocked.json["retryAfterSeconds"])


def test_the_lockout_is_per_address(make_browser, make_user):
    make_user()
    noisy, quiet = make_browser("10.0.0.1"), make_browser("10.0.0.2")

    for _ in range(5):
        noisy.post("/api/auth/login", json={"username": "alice", "password": "wrong password!"})

    assert noisy.post("/api/auth/login", json={"username": "alice", "password": "a long enough phrase"}).status_code == 429
    assert quiet.post("/api/auth/login", json={"username": "alice", "password": "a long enough phrase"}).status_code == 200


def test_a_good_login_forgives_earlier_failures(browser, make_user):
    make_user()

    for _ in range(4):
        browser.post("/api/auth/login", json={"username": "alice", "password": "wrong password!"})

    assert browser.post("/api/auth/login", json={"username": "alice", "password": "a long enough phrase"}).status_code == 200
    assert db.query_one("SELECT COUNT(*) AS n FROM auth_events WHERE kind = 'LOGIN_FAILURE'")["n"] == 0


def test_at_most_three_signups_a_day_from_one_address(make_browser):
    browser = make_browser("10.0.0.9")

    for n in range(3):
        response = browser.post("/api/auth/register", json={**GOOD, "username": f"user{n}", "email": f"u{n}@example.com"})
        assert response.status_code == 201

    fourth = browser.post("/api/auth/register", json={**GOOD, "username": "user4", "email": "u4@example.com"})
    assert (fourth.status_code, fourth.json["message"]) == (
        429,
        "Too many accounts have been created from this address today.",
    )


def test_closing_registration_stops_signup_but_not_sign_in(browser, make_user):
    make_user()
    db.execute("UPDATE app_settings SET value = 'false' WHERE key = 'registration_enabled'")

    closed = browser.post("/api/auth/register", json={**GOOD, "username": "newcomer", "email": "n@example.com"})
    assert (closed.status_code, closed.json["message"]) == (403, "Registration is closed at the moment.")

    assert browser.post("/api/auth/login", json={"username": "alice", "password": "a long enough phrase"}).status_code == 200

    page = browser.get("/register").get_data(as_text=True)
    assert "New accounts are closed for now" in page and "hx-post=\"/register\"" not in page

    assert "New accounts are closed for now" in browser.get("/login").get_data(as_text=True)


# --- the client address ------------------------------------------------------------------------


def test_forwarded_header_is_ignored_unless_a_proxy_is_trusted(browser):
    browser.post(
        "/api/auth/login",
        json={"username": "alice", "password": "wrong password!"},
        headers={"X-Forwarded-For": "6.6.6.6"},
    )

    assert db.query_one("SELECT ip FROM auth_events")["ip"] == "10.0.0.1"


def test_a_trusted_proxy_means_the_last_forwarded_entry(app):
    from tests.conftest import Browser

    app.config["ALL_AN"] = type(app.config["ALL_AN"])(
        **{**app.config["ALL_AN"].__dict__, "trust_proxy_headers": True}
    )
    browser = Browser(app)

    # The client claims to be 1.1.1.1; the proxy appended the address it really saw.
    browser.post(
        "/api/auth/login",
        json={"username": "alice", "password": "wrong password!"},
        headers={"X-Forwarded-For": "1.1.1.1, 203.0.113.7"},
    )

    assert db.query_one("SELECT ip FROM auth_events")["ip"] == "203.0.113.7"


# --- CSRF --------------------------------------------------------------------------------------


def test_a_post_without_the_csrf_token_is_refused(browser, make_user):
    make_user()

    response = browser.post(
        "/api/auth/login", json={"username": "alice", "password": "a long enough phrase"}, csrf=False
    )

    assert response.status_code == 403
    assert db.query_one("SELECT COUNT(*) AS n FROM sessions")["n"] == 0


def test_a_post_with_the_wrong_csrf_token_is_refused(browser):
    browser.get("/login")

    response = browser.post(
        "/api/auth/logout", headers={"X-CSRF-Token": "forged"}
    )

    assert response.status_code == 403


def test_pages_carry_the_token_for_htmx_and_for_plain_forms(browser):
    page = browser.get("/login").get_data(as_text=True)
    token = browser.client.get_cookie("csrf").value

    assert f'"X-CSRF-Token": "{token}"' in page
    assert f'name="csrf_token" value="{token}"' in page


# --- the HTML forms ----------------------------------------------------------------------------


def test_htmx_login_redirects_with_a_header_and_sets_the_session(browser, make_user):
    make_user()

    response = browser.post(
        "/login",
        data={"username": "alice", "password": "a long enough phrase", "next": "/results"},
        headers={"HX-Request": "true"},
    )

    assert response.status_code == 204
    assert response.headers["HX-Redirect"] == "/results"
    assert any(c.startswith("sid=") for c in response.headers.getlist("Set-Cookie"))


def test_a_plain_form_post_gets_an_ordinary_redirect(browser, make_user):
    make_user()

    response = browser.post("/login", data={"username": "alice", "password": "a long enough phrase"})

    assert response.status_code == 303 and response.headers["Location"] == "/quizzes"


def test_next_cannot_send_you_off_site(browser, make_user):
    make_user()

    for hostile in ("//evil.example", "https://evil.example", "/\\evil.example"):
        response = browser.post(
            "/login", data={"username": "alice", "password": "a long enough phrase", "next": hostile}
        )
        assert response.headers["Location"] == "/quizzes", hostile


def test_a_failed_htmx_login_returns_just_the_form_with_errors(browser, make_user):
    make_user()

    response = browser.post(
        "/login",
        data={"username": "alice", "password": "wrong password!"},
        headers={"HX-Request": "true"},
    )
    body = response.get_data(as_text=True)

    assert response.status_code == 422
    assert body.lstrip().startswith("<form") and "<html" not in body
    assert "That username and password do not match." in body
    assert 'value="alice"' in body  # the username is kept; the password never is


def test_a_failed_htmx_register_shows_field_messages(browser):
    response = browser.post(
        "/register",
        data={"username": "a", "email": "nope", "password": "short"},
        headers={"HX-Request": "true"},
    )
    body = response.get_data(as_text=True)

    assert response.status_code == 422
    assert "username must be at least 3 characters" in body
    assert "email is not a valid address" in body
    assert "password must be at least 8 characters" in body


def test_logout_via_htmx_redirects_home(browser, make_user):
    make_user()
    browser.post("/api/auth/login", json={"username": "alice", "password": "a long enough phrase"})

    response = browser.post("/logout", headers={"HX-Request": "true"})

    assert response.status_code == 204 and response.headers["HX-Redirect"] == "/"
    assert browser.get("/api/auth/me").status_code == 401


def test_html_username_is_escaped_in_the_form(browser):
    response = browser.post(
        "/login",
        data={"username": '"><script>alert(1)</script>', "password": "whatever long"},
        headers={"HX-Request": "true"},
    )

    assert "<script>alert(1)</script>" not in response.get_data(as_text=True)


def test_api_paths_return_json_errors_pages_return_html(browser):
    api = browser.get("/api/nope")
    page = browser.get("/nope")

    assert api.status_code == 404 and api.json == {"message": "No API route for GET /api/nope"}
    assert browser.get("/api/quizzes/abc").json == {"message": "Not found."}  # a route, with a bad id
    assert page.status_code == 303 and page.headers["Location"] == "/"  # an unknown address is not a page
    assert browser.get("/healthz").json == {"status": "ok"}
