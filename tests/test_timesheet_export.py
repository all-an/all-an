import csv
import io

import pytest

from all_an import db, timesheet
from all_an.timesheet_export import safe_cell
from tests.test_quizzes import sign_in_as


def text(response):
    return response.get_data(as_text=True)


def parse(response):
    body = text(response)
    assert body.startswith("﻿")
    return list(csv.reader(io.StringIO(body.removeprefix("﻿"))))


@pytest.fixture
def alice(browser, make_user):
    make_user("alice")
    return sign_in_as(browser, "alice")


@pytest.fixture
def bob(make_browser, make_user):
    make_user("bob")
    return sign_in_as(make_browser("10.0.0.2"), "bob")


def uid(name="alice"):
    return db.query_one("SELECT id FROM users WHERE username = %s", (name,))["id"]


def day(user, when, end="18:30", **extra):
    return timesheet.insert(
        user,
        {"work_date": when, "start_hour": "09:00", "start_lunch": "12:30", "end_lunch": "13:30",
         "end_work_hour": end, "onsite": True, **extra},
    )


@pytest.mark.parametrize(
    "value, shown",
    [("=SUM(A1)", "'=SUM(A1)"), ("+1", "'+1"), ("-1", "'-1"), ("@x", "'@x"), ("\tx", "'\tx"), ("plain", "plain"), ("", "")],
)
def test_cells_that_look_like_formulas_are_defused(value, shown):
    assert safe_cell(value) == shown


def test_a_month_exports_its_days_in_order_with_a_header(alice):
    day(uid(), "2026-03-03", "17:30", notes="quiet, calm day")
    day(uid(), "2026-03-02")
    timesheet.insert(uid(), {"work_date": "2026-03-04", "day_type": "HOLIDAY"})
    day(uid(), "2026-04-01")

    response = alice.get("/timesheet/2026/3/export.csv")
    rows = parse(response)

    assert response.status_code == 200 and response.headers["Content-Type"] == "text/csv; charset=utf-8"
    assert response.headers["Content-Disposition"] == 'attachment; filename="timesheet-2026-03.csv"'
    assert rows[0][0] == "Date" and rows[0][-1] == "Notes"
    assert [r[0] for r in rows[1:]] == ["2026-03-02", "2026-03-03", "2026-03-04"]
    assert rows[1] == ["2026-03-02", "Work", "09:00", "12:30", "13:30", "18:30", "8:30", "0:00", "0:30", "yes", ""]
    assert rows[2][6] == "7:30" and rows[2][7] == "0:30" and rows[2][-1] == "quiet, calm day"
    assert rows[3][1] == "Holiday" and rows[3][2] == "" and rows[3][9] == "no"


def test_a_year_exports_every_month(alice):
    day(uid(), "2026-01-05")
    day(uid(), "2026-12-30")
    day(uid(), "2025-12-31")

    response = alice.get("/timesheet/2026/export.csv")

    assert [r[0] for r in parse(response)[1:]] == ["2026-01-05", "2026-12-30"]
    assert response.headers["Content-Disposition"] == 'attachment; filename="timesheet-2026.csv"'


def test_notes_that_look_like_formulas_are_defused_in_the_file(alice):
    day(uid(), "2026-03-02", notes='=HYPERLINK("http://evil.example")')

    assert parse(alice.get("/timesheet/2026/3/export.csv"))[1][-1] == "'=HYPERLINK(\"http://evil.example\")"


def test_an_empty_month_is_just_the_header(alice):
    assert len(parse(alice.get("/timesheet/2026/5/export.csv"))) == 1


def test_only_your_own_rows_are_exported(alice, bob):
    day(uid("bob"), "2026-03-02", notes="bobs")

    assert len(parse(alice.get("/timesheet/2026/3/export.csv"))) == 1


def test_export_needs_a_signed_in_user(browser):
    assert browser.get("/timesheet/2026/3/export.csv").status_code == 303
    assert browser.get("/timesheet/2026/export.csv").status_code == 303


@pytest.mark.parametrize("path", ["/timesheet/2026/13/export.csv", "/timesheet/1850/export.csv"])
def test_impossible_periods_are_not_files(alice, path):
    assert alice.get(path, headers={"HX-Request": "true"}).status_code == 404


def test_the_pages_offer_the_download_only_when_there_is_something(alice):
    assert "export.csv" not in text(alice.get("/timesheet/2026/3"))

    day(uid(), "2026-03-02")

    assert 'href="/timesheet/2026/3/export.csv"' in text(alice.get("/timesheet/2026/3"))
    assert 'href="/timesheet/2026/export.csv"' in text(alice.get("/timesheet/2026"))
