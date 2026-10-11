from datetime import date

import pytest

from all_an import db, timesheet, timesheet_stats as stats
from tests.test_quizzes import sign_in_as

HX = {"HX-Request": "true"}


def text(response):
    return response.get_data(as_text=True)


# --- the on-site review ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "onsite, work, target, met, needed",
    [(3, 6, 50, True, 0), (2, 6, 50, False, 1), (0, 5, 50, False, 3), (5, 5, 50, True, 0), (1, 3, 60, False, 1)],
)
def test_the_review_is_exact_at_the_boundary(onsite, work, target, met, needed):
    result = stats.review(onsite, work, target)

    assert result["met"] is met and result["needed"] == needed and result["target"] == target


def test_a_period_with_no_worked_days_is_not_judged():
    assert stats.review(0, 0, 50) == {"percent": None, "target": 50, "met": None, "needed": 0}


@pytest.mark.parametrize("minutes, shown", [(390, "+6:30"), (-75, "-1:15"), (0, "0:00")])
def test_balances_are_signed(minutes, shown):
    assert stats.signed(minutes) == shown


def test_week_and_month_boundaries():
    assert stats.week_of(date(2026, 3, 4)) == (date(2026, 3, 2), date(2026, 3, 8))  # Monday to Sunday
    assert stats.week_of(date(2026, 3, 8)) == (date(2026, 3, 2), date(2026, 3, 8))
    assert stats.month_of(date(2026, 2, 10)) == (date(2026, 2, 1), date(2026, 2, 28))


# --- the numbers -------------------------------------------------------------------------------


@pytest.fixture
def alice(browser, make_user):
    make_user("alice")
    return sign_in_as(browser, "alice")


def uid(name="alice"):
    return db.query_one("SELECT id FROM users WHERE username = %s", (name,))["id"]


def day(user, when, end="18:00", onsite=True, kind="WORK"):
    """09:00 to `end` with an hour's lunch: 18:00 is exactly the 8 hour minimum."""
    return timesheet.insert(
        user,
        {
            "work_date": when, "day_type": kind, "start_hour": "09:00", "start_lunch": "12:30",
            "end_lunch": "13:30", "end_work_hour": end, "onsite": onsite,
        },
    )


def test_a_weeks_totals_leave_out_days_off(app, make_user):
    user = make_user("alice")["id"]
    day(user, "2026-03-02", "18:30")                  # +0:30, on site
    day(user, "2026-03-03", "17:30", onsite=False)    # -0:30
    day(user, "2026-03-04", kind="HOLIDAY")
    day(user, "2026-03-09")                           # next week

    week = stats.week_totals(user, date(2026, 3, 5))

    assert (week["work_days"], week["days_off"], week["onsite_days"]) == (2, 1, 1)
    assert week["total_worked"] == 16 * 60 and week["net"] == 0
    assert (week["above_minimum"], week["below_minimum"]) == (30, 30)


def test_the_running_balance_carries_across_weeks_and_months_and_can_go_negative(app, make_user):
    user = make_user("alice")["id"]
    day(user, "2026-01-05", "19:00")   # +1:00, Jan, week of 5 Jan
    day(user, "2026-01-13", "17:00")   # -1:00, Jan, week of 12 Jan
    day(user, "2026-02-03", "16:00")   # -2:00, Feb
    day(user, "2025-12-31", "20:00")   # a different year: not in the 2026 balance

    months = stats.months_of_year(user, 2026)
    assert [m["period_start"].month for m in months] == [1, 2]
    assert [m["net"] for m in months] == [0, -120]
    assert [m["balance"] for m in months] == [0, -120]

    weeks = stats.weeks_of_year(user, 2026)
    assert [w["balance"] for w in weeks] == [60, 0, -120]
    assert weeks[0]["period_start"] == date(2026, 1, 5)


def test_the_rolling_window_is_this_month_and_the_five_before(app, make_user):
    user = make_user("alice")["id"]
    day(user, "2025-12-15")   # outside: 7 months before July... in range for Jan only
    day(user, "2026-02-10")   # first month of the window ending July
    day(user, "2026-07-20")
    day(user, "2026-01-31")   # one month too early for a July window

    window = stats.rolling_months(user, date(2026, 7, 10))

    assert window["start"] == date(2026, 2, 1) and window["end"] == date(2026, 7, 31)
    assert window["work_days"] == 2

    across_year = stats.rolling_months(user, date(2026, 2, 10))
    assert across_year["start"] == date(2025, 9, 1) and across_year["work_days"] == 3


def test_nothing_leaks_between_people(app, make_user):
    alice, bob = make_user("alice")["id"], make_user("bob")["id"]
    day(alice, "2026-03-02")

    assert stats.month_totals(bob, date(2026, 3, 2))["work_days"] == 0
    assert stats.months_of_year(bob, 2026) == []


# --- the page ----------------------------------------------------------------------------------


def test_the_dashboard_needs_a_signed_in_user(browser):
    assert browser.get("/timesheet/dashboard").status_code == 303


def test_the_dashboard_shows_periods_verdicts_and_balances(alice):
    user = uid()
    day(user, "2026-03-02", "18:30")
    day(user, "2026-03-03", "17:30", onsite=False)
    day(user, "2026-03-04", onsite=False)
    day(user, "2026-04-06", "19:00")

    page = text(alice.get("/timesheet/dashboard?date=2026-03-04"))

    assert "Week · 2 Mar – 8 Mar" in page and "Month · March 2026" in page
    assert "On site 33% · target 50% — 1 more on-site day needed" in page  # March: 1 of 3
    assert "balance +0:00" not in page and "balance 0:00" in page          # March nets to zero
    assert "balance +1:00" in page                                          # April adds an hour
    assert "Last 6 months" in page and "Mar 2026" in page
    assert 'href="/timesheet/2026/3"' in page and "Week of 2 Mar" in page


def test_the_dashboard_with_nothing_logged_does_not_fail(alice):
    page = text(alice.get("/timesheet/dashboard?date=2026-03-04"))

    assert "No worked days" in page and "Nothing logged in 2026" in page


def test_a_bad_date_falls_back_to_today(alice):
    assert alice.get("/timesheet/dashboard?date=nonsense").status_code == 200


def test_the_target_comes_from_the_constants_table(alice):
    day(uid(), "2026-03-02", onsite=False)
    day(uid(), "2026-03-03", onsite=True)
    db.execute("UPDATE timesheet_constants SET value = '60' WHERE key = 'minimum_onsite_percent'")

    page = text(alice.get("/timesheet/dashboard?date=2026-03-02"))

    assert "target 60%" in page and "1 more on-site day needed" in page
