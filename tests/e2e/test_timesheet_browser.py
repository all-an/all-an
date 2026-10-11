import pytest

from playwright.sync_api import expect

pytestmark = pytest.mark.e2e

PHONE = {"width": 360, "height": 740}
DESKTOP = {"width": 1280, "height": 800}


def go(page, path):
    page.goto(page.base_url + path)


def sign_in(page, make_user, username="alice"):
    make_user(username)
    go(page, "/login")
    page.fill("input[name=username]", username)
    page.fill("input[name=password]", "a long enough phrase")
    page.click("button[type=submit]")
    page.wait_for_url("**/quizzes")


def no_sideways_scroll(page):
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


@pytest.mark.parametrize("size", [PHONE, DESKTOP], ids=["phone", "desktop"])
def test_filling_the_timesheet_from_years_down_to_a_day(page, make_user, size):
    page.set_viewport_size(size)
    sign_in(page, make_user)

    # The nav is behind the hamburger on a phone.
    if size is PHONE:
        page.click(".nav-toggle")
    page.click("a[href='/timesheet']")
    expect(page.locator(".empty-state")).to_contain_text("No days logged yet")
    no_sideways_scroll(page)

    # Pick a date: the month opens with the form ready.
    page.fill("input[name=date]", "2026-03-02")
    page.click("button:has-text('+ Add day')")
    page.wait_for_url("**/timesheet/2026/3?add=2026-03-02")
    expect(page.locator("#new-row")).to_contain_text("New day")

    page.fill("#new-row input[name=start_hour]", "09:00")
    page.fill("#new-row input[name=start_lunch]", "12:30")
    page.fill("#new-row input[name=end_lunch]", "13:30")
    page.fill("#new-row input[name=end_work_hour]", "18:30")
    page.check("#new-row input[name=onsite]")
    page.fill("#new-row textarea[name=notes]", "Release day")
    page.click("#new-row button[type=submit]")

    expect(page.locator("#month-body .notice")).to_have_text("Day added.")
    expect(page.locator("#month-body .ts-day")).to_have_count(1)
    expect(page.locator("#month-body .ts-day")).to_contain_text("Mon 2 Mar")
    expect(page.locator("#month-body .ts-day")).to_contain_text("8:30")
    expect(page.locator("#month-body .ts-day")).to_contain_text("+0:30")
    expect(page.locator("#month-body input[name=start_hour]")).to_have_count(0)  # a line, not the form
    expect(page.locator("#new-row")).to_be_empty()
    no_sideways_scroll(page)

    # Open the day. An error stays beside the field and keeps what was typed.
    page.click("#month-body .ts-day")
    page.wait_for_url("**/timesheet/rows/*")
    assert page.input_value("input[name=end_work_hour]") == "18:30"
    page.fill("input[name=end_work_hour]", "08:00")
    page.click("#day-form button[type=submit]")
    expect(page.locator("#day-form .field-error", has_text="end of work must be after the start")).to_have_count(1)
    assert page.input_value("input[name=end_work_hour]") == "08:00"

    page.fill("input[name=end_work_hour]", "17:30")
    page.click("#day-form button[type=submit]")
    expect(page.locator("#day-form .notice")).to_have_text("Saved.")
    no_sideways_scroll(page)

    # The line in the month shows the new total.
    page.click("a.ts-back")
    expect(page.locator("#month-body .ts-day")).to_contain_text("7:30")

    # Up to the year and the list of years: only what exists is there.
    go(page, "/timesheet/2026")
    expect(page.locator(".ts-tile")).to_have_count(1)
    expect(page.locator(".ts-tile")).to_contain_text("March")
    no_sideways_scroll(page)

    go(page, "/timesheet")
    expect(page.locator(".ts-tile")).to_have_count(1)
    expect(page.locator(".ts-tile")).to_contain_text("2026")
    assert page.js_errors == []


def test_a_day_off_hides_the_times(page, make_user):
    page.set_viewport_size(PHONE)
    sign_in(page, make_user)
    go(page, "/timesheet/2026/3?add=2026-03-04")

    expect(page.locator("#new-row .ts-times")).to_be_visible()
    page.select_option("#new-row select[name=day_type]", "HOLIDAY")
    expect(page.locator("#new-row .ts-times")).to_be_hidden()

    page.click("#new-row button[type=submit]")
    expect(page.locator("#month-body .ts-day")).to_have_count(1)
    expect(page.locator("#month-body .ts-day")).to_contain_text("Holiday")
    expect(page.locator("#month-body .ts-summary")).to_contain_text("days off")


@pytest.mark.parametrize("size", [PHONE, DESKTOP], ids=["phone", "desktop"])
def test_the_dashboard_fits_the_screen_and_links_through(page, make_user, size):
    from all_an import timesheet, users

    page.set_viewport_size(size)
    sign_in(page, make_user)
    user = users.find_by_username("alice")["id"]

    for when, end, onsite in (("2026-03-02", "18:30", True), ("2026-03-03", "17:30", False), ("2026-04-07", "18:00", True)):
        timesheet.insert(user, {
            "work_date": when, "start_hour": "09:00", "start_lunch": "12:30", "end_lunch": "13:30",
            "end_work_hour": end, "onsite": onsite,
        })

    go(page, "/timesheet/dashboard?date=2026-03-04")
    expect(page.locator("h1")).to_have_text("Dashboard")
    expect(page.locator("#week-title")).to_contain_text("2 Mar")
    expect(page.locator("#month-title")).to_contain_text("March 2026")
    no_sideways_scroll(page)

    page.click("a.ts-line:has-text('April')")
    page.wait_for_url("**/timesheet/2026/4")
    assert page.js_errors == []
