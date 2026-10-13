from datetime import date, time

import pytest

from all_an import db, timesheet
from all_an.errors import ApiError

MINIMUM = 480


def t(text):
    return time.fromisoformat(text)


def row(**overrides):
    base = {
        "work_date": "2026-03-02",
        "day_type": "WORK",
        "start_hour": "09:00",
        "start_lunch": "12:30",
        "end_lunch": "13:30",
        "end_work_hour": "18:00",
        "onsite": True,
        "notes": "",
    }
    return {**base, **overrides}


# --- the calculation ---------------------------------------------------------------------------


def test_lunch_is_taken_off_the_worked_time():
    assert timesheet.worked_minutes(t("09:00"), t("12:30"), t("13:30"), t("18:00")) == 480


def test_a_day_without_lunch_counts_everything():
    assert timesheet.worked_minutes(t("08:00"), None, None, t("12:15")) == 255


@pytest.mark.parametrize(
    "total, below, above",
    [(450, 30, 0), (480, 0, 0), (525, 0, 45)],
)
def test_below_at_and_above_the_minimum(total, below, above):
    end = f"{(9 * 60 + total) // 60:02d}:{(9 * 60 + total) % 60:02d}"
    result = timesheet.compute("WORK", t("09:00"), None, None, t(end), MINIMUM)

    assert result == {"total_worked": total, "below_minimum": below, "above_minimum": above}


@pytest.mark.parametrize("kind", ["LEAVE", "HOLIDAY", "SICK"])
def test_a_day_off_owes_nothing_and_adds_nothing(kind):
    assert timesheet.compute(kind, None, None, None, None, MINIMUM) == {
        "total_worked": 0, "below_minimum": 0, "above_minimum": 0,
    }


@pytest.mark.parametrize("minutes, shown", [(465, "7:45"), (0, "0:00"), (-75, "-1:15"), (600, "10:00")])
def test_minutes_are_shown_as_hours_and_minutes(minutes, shown):
    assert timesheet.format_minutes(minutes) == shown


# --- reading what was typed --------------------------------------------------------------------


def test_a_full_day_is_read_and_computed():
    result = timesheet.normalise(row(), MINIMUM)

    assert result["work_date"] == date(2026, 3, 2)
    assert result["start_hour"] == t("09:00") and result["end_work_hour"] == t("18:00")
    assert (result["total_worked"], result["below_minimum"], result["above_minimum"]) == (480, 0, 0)
    assert result["onsite"] is True and result["notes"] is None


def test_lunch_is_optional():
    result = timesheet.normalise(row(start_lunch="", end_lunch=""), MINIMUM)

    assert result["start_lunch"] is None and result["total_worked"] == 540
    assert result["above_minimum"] == 60


def test_seconds_in_a_time_are_dropped():
    assert timesheet.normalise(row(start_hour="09:00:45"), MINIMUM)["start_hour"] == t("09:00")


def problems(**overrides):
    with pytest.raises(ApiError) as caught:
        timesheet.normalise(row(**overrides), MINIMUM)

    assert caught.value.status == 400
    return caught.value.details["fields"]


def test_a_working_day_may_have_no_times_at_all():
    result = timesheet.normalise(
        row(start_hour="", start_lunch="", end_lunch="", end_work_hour=""), MINIMUM
    )

    assert result["start_hour"] is None and result["end_work_hour"] is None
    assert (result["total_worked"], result["below_minimum"], result["above_minimum"]) == (0, 0, 0)


def test_a_day_with_only_a_start_is_neutral_until_it_has_an_end():
    result = timesheet.normalise(row(end_work_hour="", start_lunch="", end_lunch=""), MINIMUM)

    assert result["start_hour"] is not None and result["total_worked"] == 0
    assert result["below_minimum"] == 0


def test_half_a_lunch_is_refused():
    assert "start_lunch" in problems(end_lunch="")


def test_times_must_be_in_order():
    assert "end_work_hour" in problems(end_work_hour="08:00")
    assert "start_lunch" in problems(start_lunch="08:00")
    assert "end_lunch" in problems(start_lunch="13:00", end_lunch="12:00")
    assert "end_lunch" in problems(end_lunch="19:00")


def test_bad_values_are_named_by_field():
    fields = problems(work_date="2026-02-30", start_hour="9am", day_type="NAP", notes="x" * 501)

    assert set(fields) == {"work_date", "start_hour", "day_type", "notes"}


@pytest.mark.parametrize("kind", ["LEAVE", "HOLIDAY", "SICK"])
def test_a_day_off_drops_its_times_and_the_on_site_flag(kind):
    result = timesheet.normalise(row(day_type=kind), MINIMUM)

    assert result["day_type"] == kind
    assert result["start_hour"] is None and result["end_work_hour"] is None
    assert result["onsite"] is False and result["total_worked"] == 0


def test_a_day_off_needs_no_times_at_all():
    result = timesheet.normalise({"work_date": "2026-03-03", "day_type": "holiday"}, MINIMUM)

    assert result["day_type"] == "HOLIDAY"


# --- the constants -----------------------------------------------------------------------------


def test_constants_are_read_from_the_table(app):
    assert timesheet.read_constants() == {"minimumMinutes": 480, "minimumOnsitePercent": 50}

    db.execute("UPDATE timesheet_constants SET value = '7.5' WHERE key = 'minimum_hours'")
    db.execute("UPDATE timesheet_constants SET value = '60' WHERE key = 'minimum_onsite_percent'")

    assert timesheet.read_constants() == {"minimumMinutes": 450, "minimumOnsitePercent": 60}


def test_unreadable_or_missing_constants_fall_back(app):
    db.execute("UPDATE timesheet_constants SET value = 'lots' WHERE key = 'minimum_hours'")
    db.execute("DELETE FROM timesheet_constants WHERE key = 'minimum_onsite_percent'")

    assert timesheet.read_constants() == {"minimumMinutes": 480, "minimumOnsitePercent": 50}


# --- rows --------------------------------------------------------------------------------------


@pytest.fixture
def alice(make_user):
    return make_user("alice")["id"]


@pytest.fixture
def bob(make_user):
    return make_user("bob")["id"]


def test_insert_stores_the_computed_columns(app, alice):
    saved = timesheet.insert(alice, row(end_work_hour="18:30", notes="  late release  "))

    assert saved["total_worked"] == 510 and saved["above_minimum"] == 30 and saved["below_minimum"] == 0
    assert saved["notes"] == "late release" and saved["onsite"] is True
    assert saved["work_date"] == date(2026, 3, 2)


def test_one_row_per_person_per_day(app, alice, bob):
    timesheet.insert(alice, row())

    with pytest.raises(ApiError) as caught:
        timesheet.insert(alice, row())

    assert caught.value.status == 409

    timesheet.insert(bob, row())  # the same day is fine for someone else


def test_update_recomputes_and_can_change_the_day_type(app, alice):
    saved = timesheet.insert(alice, row())

    shorter = timesheet.update(alice, saved["id"], row(end_work_hour="16:00"))
    assert shorter["total_worked"] == 360 and shorter["below_minimum"] == 120

    off = timesheet.update(alice, saved["id"], row(day_type="SICK"))
    assert off["start_hour"] is None and off["total_worked"] == 0 and off["onsite"] is False


def test_moving_a_row_onto_a_taken_day_conflicts(app, alice):
    timesheet.insert(alice, row(work_date="2026-03-02"))
    other = timesheet.insert(alice, row(work_date="2026-03-03"))

    with pytest.raises(ApiError) as caught:
        timesheet.update(alice, other["id"], row(work_date="2026-03-02"))

    assert caught.value.status == 409


def test_nobody_can_read_change_or_delete_another_persons_row(app, alice, bob):
    saved = timesheet.insert(alice, row())

    assert timesheet.find(bob, saved["id"]) is None
    for action in (
        lambda: timesheet.update(bob, saved["id"], row()),
        lambda: timesheet.delete(bob, saved["id"]),
    ):
        with pytest.raises(ApiError) as caught:
            action()
        assert caught.value.status == 404

    assert timesheet.find(alice, saved["id"]) is not None


def test_delete_removes_the_row(app, alice):
    saved = timesheet.insert(alice, row())
    timesheet.delete(alice, saved["id"])

    assert timesheet.find(alice, saved["id"]) is None


def test_the_database_refuses_what_the_service_would_have_refused(app, alice):
    with pytest.raises(Exception):
        db.execute(
            "INSERT INTO timesheet (user_id, work_date, day_type, start_hour, end_work_hour)"
            " VALUES (%s, '2026-03-02', 'WORK', '18:00', '09:00')",
            (alice,),
        )


def test_years_and_months_only_exist_where_there_are_rows(app, alice, bob):
    for day in ("2025-12-30", "2026-01-05", "2026-03-02", "2026-03-03"):
        timesheet.insert(alice, row(work_date=day, end_work_hour="17:30"))
    timesheet.insert(alice, row(work_date="2026-03-04", day_type="LEAVE"))
    timesheet.insert(bob, row(work_date="2024-06-01"))

    years = timesheet.list_years(alice)
    assert [y["year"] for y in years] == [2026, 2025]
    assert years[0]["days"] == 4

    months = timesheet.list_months(alice, 2026)
    assert [m["month"] for m in months] == [1, 3]
    march = months[1]
    assert (march["days"], march["work_days"], march["days_off"]) == (3, 2, 1)
    assert march["total_worked"] == 2 * 450 and march["onsite_days"] == 2

    assert timesheet.list_months(alice, 2024) == []
    assert [y["year"] for y in timesheet.list_years(bob)] == [2024]


def test_a_month_lists_its_rows_in_date_order_and_only_its_own(app, alice):
    for day in ("2026-03-31", "2026-03-01", "2026-04-01", "2026-02-28"):
        timesheet.insert(alice, row(work_date=day))

    days = [r["work_date"] for r in timesheet.list_month(alice, 2026, 3)]

    assert days == [date(2026, 3, 1), date(2026, 3, 31)]
    assert timesheet.list_month(alice, 2026, 13) == []


def test_changing_the_minimum_leaves_saved_rows_until_recomputed(app, alice):
    saved = timesheet.insert(alice, row(end_work_hour="16:00"))  # 360 worked, 120 short of 480
    off = timesheet.insert(alice, row(work_date="2026-03-03", day_type="HOLIDAY"))

    db.execute("UPDATE timesheet_constants SET value = '7' WHERE key = 'minimum_hours'")
    assert timesheet.find(alice, saved["id"])["below_minimum"] == 120  # kept as saved

    assert timesheet.recompute(alice) == 1  # the holiday is not touched
    after = timesheet.find(alice, saved["id"])
    assert after["below_minimum"] == 60 and after["above_minimum"] == 0
    assert timesheet.find(alice, off["id"])["below_minimum"] == 0
