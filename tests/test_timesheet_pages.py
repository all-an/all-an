from datetime import date

import pytest

from all_an import db, timesheet
from tests.test_quizzes import sign_in_as

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


def user_id(name):
    return db.query_one("SELECT id FROM users WHERE username = %s", (name,))["id"]


def form(day="2026-03-02", **overrides):
    return {
        "work_date": day, "day_type": "WORK", "start_hour": "09:00", "start_lunch": "12:30",
        "end_lunch": "13:30", "end_work_hour": "18:00", "onsite": "on", "notes": "",
        **overrides,
    }


def add(client, day="2026-03-02", **overrides):
    year, month = day[:4], int(day[5:7])
    return client.post(f"/timesheet/{year}/{month}/rows", data=form(day, **overrides), headers=HX)


# --- access ------------------------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/timesheet", "/timesheet/2026", "/timesheet/2026/3"])
def test_the_pages_need_a_signed_in_user(browser, path):
    response = browser.get(path)

    assert response.status_code == 303 and response.headers["Location"].startswith("/login")


def test_the_nav_links_to_the_timesheet_only_when_signed_in(browser, alice):
    assert 'href="/timesheet"' in text(browser.get("/quizzes"))


def test_a_visitor_does_not_see_the_timesheet_link(make_browser):
    assert 'href="/timesheet"' not in text(make_browser().get("/about"))


# --- years and months --------------------------------------------------------------------------


def test_with_no_rows_the_years_page_explains(alice):
    page = text(alice.get("/timesheet"))

    assert "No days logged yet" in page and 'action="/timesheet/add"' in page


def test_only_years_and_months_with_rows_are_listed(alice):
    for day in ("2025-12-30", "2026-03-02", "2026-03-03"):
        assert add(alice, day).status_code == 200

    years = text(alice.get("/timesheet"))
    assert 'href="/timesheet/2026"' in years and 'href="/timesheet/2025"' in years
    assert 'href="/timesheet/2024"' not in years

    months = text(alice.get("/timesheet/2026"))
    assert 'href="/timesheet/2026/3"' in months and 'href="/timesheet/2026/4"' not in months
    assert "2 worked days" in months and "16:00 worked" in months


def test_the_date_picker_opens_that_month_with_the_form_ready(alice):
    response = alice.get("/timesheet/add?date=2026-07-14")

    assert response.status_code == 303 and response.headers["Location"] == "/timesheet/2026/7?add=2026-07-14"

    page = text(alice.get("/timesheet/2026/7?add=2026-07-14"))
    assert 'value="2026-07-14"' in page and "New day" in page


def test_a_bad_picked_date_goes_back_to_the_years(alice):
    assert alice.get("/timesheet/add?date=nonsense").headers["Location"] == "/timesheet"


def test_impossible_months_and_years_are_not_pages(alice):
    assert alice.get("/timesheet/2026/13", headers=HX).status_code == 404
    assert alice.get("/timesheet/1850", headers=HX).status_code == 404


# --- a month -----------------------------------------------------------------------------------


def test_an_empty_month_is_still_a_page_you_can_add_to(alice):
    page = text(alice.get("/timesheet/2026/5"))

    assert "No days logged in May yet" in page and "May 2026" in page


def test_adding_a_day_shows_it_with_its_totals_and_puts_the_form_away(alice):
    response = add(alice, end_work_hour="18:30")
    page = text(response)

    assert response.status_code == 200
    assert "Day added." in page and 'href="/timesheet/rows/' in page
    assert "Mon 2 Mar" in page and "8:30" in page and "+0:30" in page
    assert 'id="new-row" hx-swap-oob="true"' in page


def test_a_month_lists_one_line_per_day_and_not_the_whole_form(alice):
    add(alice, notes="a long note about the day")

    page = text(alice.get("/timesheet/2026/3"))
    row_id = timesheet.list_month(user_id("alice"), 2026, 3)[0]["id"]

    assert f'href="/timesheet/rows/{row_id}"' in page and "Mon 2 Mar" in page and "8:00" in page
    assert 'name="start_hour"' not in page and "a long note" not in page


def test_a_day_off_is_a_line_with_its_type(alice):
    add(alice, "2026-03-04", day_type="SICK")

    assert "Sick" in text(alice.get("/timesheet/2026/3"))


def test_the_day_page_has_the_whole_day(alice):
    add(alice, notes="a long note about the day")
    row_id = timesheet.list_month(user_id("alice"), 2026, 3)[0]["id"]

    page = text(alice.get(f"/timesheet/rows/{row_id}"))

    assert 'name="start_hour"' in page and 'value="09:00"' in page and "a long note" in page
    assert 'href="/timesheet/2026/3"' in page and "March 2026" in page


def test_the_month_summary_adds_up(alice):
    add(alice, "2026-03-02", end_work_hour="18:30")   # 8:30, +0:30
    add(alice, "2026-03-03", end_work_hour="17:30", onsite="")  # 7:30, -0:30
    add(alice, "2026-03-04", day_type="HOLIDAY")

    page = text(alice.get("/timesheet/2026/3"))

    assert ">16:00<" in page          # worked
    assert ">1<" in page              # on site
    assert "+0:30" in page and "-0:30" in page
    assert "days off" in page


def test_a_failed_add_keeps_what_was_typed_and_explains(alice):
    response = add(alice, end_work_hour="08:00", notes="kept")

    assert response.status_code == 422 and response.headers["HX-Retarget"] == "#new-row"
    page = text(response)
    assert "end of work must be after the start" in page and "kept" in page
    assert timesheet.list_month(user_id("alice"), 2026, 3) == []


def test_adding_a_taken_day_is_a_clear_conflict(alice):
    add(alice)
    response = add(alice)

    assert response.status_code == 422 and "already a timesheet row for that day" in text(response)


def test_saving_a_row_recomputes_and_refreshes_the_month(alice):
    add(alice)
    row_id = timesheet.list_month(user_id("alice"), 2026, 3)[0]["id"]

    response = alice.post(f"/timesheet/rows/{row_id}", data=form(end_work_hour="16:00"), headers=HX)
    page = text(response)

    assert response.status_code == 200 and "Saved." in page
    assert "-2:00" in page and "6:00" in page


def test_a_failed_save_puts_the_form_back_in_place(alice):
    add(alice)
    row_id = timesheet.list_month(user_id("alice"), 2026, 3)[0]["id"]

    response = alice.post(f"/timesheet/rows/{row_id}", data=form(end_work_hour="07:00"), headers=HX)

    assert response.status_code == 422 and response.headers["HX-Retarget"] == "#day-form"
    assert "end of work must be after the start" in text(response)


def test_a_day_can_be_saved_with_no_times(alice):
    response = alice.post(
        "/timesheet/2026/3/rows",
        data=form(start_hour="", start_lunch="", end_lunch="", end_work_hour=""),
        headers=HX,
    )

    assert response.status_code == 200
    row = timesheet.list_month(user_id("alice"), 2026, 3)[0]
    assert row["start_hour"] is None and row["end_work_hour"] is None and row["total_worked"] == 0
    assert row["below_minimum"] == 0


def test_switching_a_day_to_leave_clears_its_hours(alice):
    add(alice)
    row_id = timesheet.list_month(user_id("alice"), 2026, 3)[0]["id"]

    alice.post(f"/timesheet/rows/{row_id}", data=form(day_type="LEAVE"), headers=HX)
    saved = timesheet.find(user_id("alice"), row_id)

    assert saved["day_type"] == "LEAVE" and saved["start_hour"] is None and saved["onsite"] is False


def test_moving_a_day_to_another_month_stays_on_the_day_and_the_back_link_follows(alice):
    add(alice)
    row_id = timesheet.list_month(user_id("alice"), 2026, 3)[0]["id"]

    response = alice.post(f"/timesheet/rows/{row_id}", data=form("2026-04-02"), headers=HX)

    assert response.status_code == 200 and "Saved." in text(response)
    assert "/timesheet/2026/4" in text(alice.get(f"/timesheet/rows/{row_id}"))
    assert timesheet.list_month(user_id("alice"), 2026, 3) == []


def test_deleting_refreshes_the_month_and_the_last_one_leaves_it(alice):
    add(alice, "2026-03-02")
    add(alice, "2026-03-03")
    first, second = (r["id"] for r in timesheet.list_month(user_id("alice"), 2026, 3))

    back = alice.post(f"/timesheet/rows/{first}/delete", headers=HX)
    assert back.status_code == 204 and back.headers["HX-Redirect"] == "/timesheet/2026/3"

    last = alice.post(f"/timesheet/rows/{second}/delete", headers=HX)
    assert last.status_code == 204 and last.headers["HX-Redirect"] == "/timesheet/2026"
    assert timesheet.list_years(user_id("alice")) == []


def test_nobody_can_open_edit_or_delete_another_persons_row(alice, bob):
    add(alice)
    row_id = timesheet.list_month(user_id("alice"), 2026, 3)[0]["id"]

    assert bob.post(f"/timesheet/rows/{row_id}", data=form(), headers=HX).status_code == 404
    assert bob.post(f"/timesheet/rows/{row_id}/delete", headers=HX).status_code == 404
    assert bob.get(f"/timesheet/rows/{row_id}", headers=HX).status_code == 404
    assert "Mon 2 Mar" not in text(bob.get("/timesheet/2026/3"))
    assert timesheet.find(user_id("alice"), row_id) is not None


def test_the_add_form_endpoint_defaults_to_a_day_in_the_month(alice):
    page = text(alice.get("/timesheet/2026/3/new?date=2026-03-09", headers=HX))
    assert 'value="2026-03-09"' in page and 'min="2026-03-01"' in page and 'max="2026-03-31"' in page

    fallback = text(alice.get("/timesheet/2026/3/new?date=2026-04-09", headers=HX))
    assert 'value="2026-04-09"' not in fallback


def test_notes_are_escaped(alice):
    add(alice, notes="<script>alert(1)</script>")

    row_id = timesheet.list_month(user_id("alice"), 2026, 3)[0]["id"]
    page = text(alice.get(f"/timesheet/rows/{row_id}"))
    assert "<script>alert(1)</script>" not in page and "&lt;script&gt;" in page
