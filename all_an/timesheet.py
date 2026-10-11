"""The timesheet: one row per person per day, with the worked-time rules the server owns.

Durations are whole minutes everywhere in this module and in the table; only the pages turn them
into h:mm. Every function that reads or writes rows takes the user's id and filters on it, so one
person's rows cannot be reached through another's.
"""

import logging
from datetime import date, time

import psycopg.errors

from . import db
from .errors import ApiError
from .validate import Fields

log = logging.getLogger(__name__)

DAY_TYPES = ("WORK", "LEAVE", "HOLIDAY", "SICK")
MAX_NOTES = 500

MINIMUM_HOURS = "minimum_hours"
MINIMUM_ONSITE_PERCENT = "minimum_onsite_percent"
DEFAULT_MINIMUM_MINUTES = 8 * 60
DEFAULT_ONSITE_PERCENT = 50

_COLUMNS = """id, user_id, work_date, day_type, start_hour, start_lunch, end_lunch, end_work_hour,
              below_minimum, above_minimum, total_worked, onsite, notes"""


# --- constants ---------------------------------------------------------------------------------


def _parse_minimum_minutes(value: str | None) -> int:
    """A value nobody can read falls back to the default rather than failing the page."""
    try:
        minutes = round(float(value) * 60)
    except (TypeError, ValueError):
        minutes = -1

    if minutes <= 0 or minutes > 24 * 60:
        if value is not None:
            log.warning("Ignoring unreadable timesheet minimum_hours %r.", value)
        return DEFAULT_MINIMUM_MINUTES

    return minutes


def _parse_percent(value: str | None) -> int:
    try:
        percent = int(value)
    except (TypeError, ValueError):
        percent = -1

    if not 0 <= percent <= 100:
        if value is not None:
            log.warning("Ignoring unreadable timesheet minimum_onsite_percent %r.", value)
        return DEFAULT_ONSITE_PERCENT

    return percent


def read_constants() -> dict:
    rows = {r["key"]: r["value"] for r in db.query("SELECT key, value FROM timesheet_constants")}

    return {
        "minimumMinutes": _parse_minimum_minutes(rows.get(MINIMUM_HOURS)),
        "minimumOnsitePercent": _parse_percent(rows.get(MINIMUM_ONSITE_PERCENT)),
    }


# --- the rules ---------------------------------------------------------------------------------


def _minutes(moment: time) -> int:
    return moment.hour * 60 + moment.minute


def worked_minutes(start: time, start_lunch: time | None, end_lunch: time | None, end: time) -> int:
    """Time between start and end, less the lunch break when there is one."""
    total = _minutes(end) - _minutes(start)

    if start_lunch is not None and end_lunch is not None:
        total -= _minutes(end_lunch) - _minutes(start_lunch)

    return total


def compute(day_type: str, start, start_lunch, end_lunch, end, minimum_minutes: int) -> dict:
    """The three stored columns. A day that is not WORK is neutral: it owes nothing and adds nothing."""
    if day_type != "WORK":
        return {"total_worked": 0, "below_minimum": 0, "above_minimum": 0}

    total = worked_minutes(start, start_lunch, end_lunch, end)

    return {
        "total_worked": total,
        "below_minimum": max(minimum_minutes - total, 0),
        "above_minimum": max(total - minimum_minutes, 0),
    }


def format_minutes(minutes: int) -> str:
    """465 -> '7:45'; negative values keep their sign: -75 -> '-1:15'."""
    sign = "-" if minutes < 0 else ""
    hours, rest = divmod(abs(minutes), 60)
    return f"{sign}{hours}:{rest:02d}"


# --- reading what was typed --------------------------------------------------------------------


def _read_time(raw) -> time | None | bool:
    """A time from 'HH:MM' (or 'HH:MM:SS'); None when empty; False when it is not a time."""
    if raw is None:
        return None
    if isinstance(raw, time):
        return raw.replace(second=0, microsecond=0, tzinfo=None)

    text = str(raw).strip()

    if not text:
        return None

    try:
        return time.fromisoformat(text).replace(second=0, microsecond=0)
    except ValueError:
        return False


def _read_bool(raw) -> bool:
    return raw is True or str(raw).strip().lower() in ("true", "on", "1", "yes")


def normalise(raw: dict, minimum_minutes: int | None = None) -> dict:
    """Turns what a form or JSON body carried into a row ready to store, or raises a 400 naming
    every field that is wrong.

    A day that is not WORK drops any times and the on-site flag it was sent with, rather than
    rejecting them: switching a day to "leave" should not need the times cleared by hand first.
    """
    fields = Fields()

    day_type = str(raw.get("day_type") or "WORK").strip().upper()
    fields.check("day_type", day_type in DAY_TYPES, "day type must be one of " + ", ".join(DAY_TYPES))

    work_date = raw.get("work_date")

    if not isinstance(work_date, date):
        try:
            work_date = date.fromisoformat(str(work_date or "").strip())
        except ValueError:
            work_date = None

    fields.check("work_date", work_date is not None, "date must be a real date")

    notes = str(raw.get("notes") or "").strip()
    fields.check("notes", len(notes) <= MAX_NOTES, f"notes must be at most {MAX_NOTES} characters")

    names = ("start_hour", "start_lunch", "end_lunch", "end_work_hour")
    times = {name: _read_time(raw.get(name)) for name in names}

    for name, value in times.items():
        fields.check(name, value is not False, "must be a time like 08:30")

    if day_type == "WORK":
        start, start_lunch, end_lunch, end = (times[n] for n in names)
        usable = all(v is not False for v in times.values())

        fields.check("start_hour", start is not None, "start of work is required")
        fields.check("end_work_hour", end is not None, "end of work is required")
        fields.check(
            "start_lunch",
            (start_lunch is None) == (end_lunch is None),
            "give both lunch times, or neither",
        )

        if usable and start is not None and end is not None:
            fields.check("end_work_hour", start < end, "end of work must be after the start")

            if start_lunch is not None and end_lunch is not None:
                fields.check("start_lunch", start < start_lunch, "lunch must start after work starts")
                fields.check("end_lunch", start_lunch < end_lunch, "lunch must end after it starts")
                fields.check("end_lunch", end_lunch < end, "lunch must end before work ends")
    else:
        times = dict.fromkeys(names)

    fields.finish()

    minimum = minimum_minutes if minimum_minutes is not None else read_constants()["minimumMinutes"]
    row = {
        "work_date": work_date,
        "day_type": day_type,
        **times,
        "onsite": day_type == "WORK" and _read_bool(raw.get("onsite")),
        "notes": notes or None,
    }
    row.update(
        compute(day_type, times["start_hour"], times["start_lunch"], times["end_lunch"], times["end_work_hour"], minimum)
    )
    return row


# --- rows --------------------------------------------------------------------------------------


def find(user_id: int, row_id: int) -> dict | None:
    return db.query_one(f"SELECT {_COLUMNS} FROM timesheet WHERE id = %s AND user_id = %s", (row_id, user_id))


def get(user_id: int, row_id: int) -> dict:
    row = find(user_id, row_id)

    if row is None:
        raise ApiError.not_found("No such timesheet row.")

    return row


_STORED = (
    "work_date", "day_type", "start_hour", "start_lunch", "end_lunch", "end_work_hour",
    "below_minimum", "above_minimum", "total_worked", "onsite", "notes",
)


def _taken() -> ApiError:
    return ApiError.conflict("There is already a timesheet row for that day.")


def insert(user_id: int, raw: dict) -> dict:
    row = normalise(raw)
    columns = ", ".join(_STORED)
    marks = ", ".join(["%s"] * len(_STORED))

    try:
        return db.query_one(
            f"INSERT INTO timesheet (user_id, {columns}) VALUES (%s, {marks}) RETURNING {_COLUMNS}",
            (user_id, *(row[c] for c in _STORED)),
        )
    except psycopg.errors.UniqueViolation as error:
        raise _taken() from error


def update(user_id: int, row_id: int, raw: dict) -> dict:
    get(user_id, row_id)
    row = normalise(raw)
    assignments = ", ".join(f"{c} = %s" for c in _STORED)

    try:
        return db.query_one(
            f"""
            UPDATE timesheet SET {assignments}, updated_at = NOW()
            WHERE id = %s AND user_id = %s
            RETURNING {_COLUMNS}
            """,
            (*(row[c] for c in _STORED), row_id, user_id),
        )
    except psycopg.errors.UniqueViolation as error:
        raise _taken() from error


def delete(user_id: int, row_id: int) -> None:
    if db.execute("DELETE FROM timesheet WHERE id = %s AND user_id = %s", (row_id, user_id)) == 0:
        raise ApiError.not_found("No such timesheet row.")


def recompute(user_id: int | None = None) -> int:
    """Recalculates the stored minutes from the current minimum, for every row or one person's.
    Rows keep the values they were saved with when the minimum changes; this is the deliberate way
    to bring them up to date."""
    minimum = read_constants()["minimumMinutes"]
    scope, params = ("AND user_id = %s", (user_id,)) if user_id is not None else ("", ())

    return db.execute(
        f"""
        UPDATE timesheet SET
            below_minimum = GREATEST(%s - total_worked, 0),
            above_minimum = GREATEST(total_worked - %s, 0)
        WHERE day_type = 'WORK' {scope}
        """,
        (minimum, minimum, *params),
    )


# --- the browsing levels -----------------------------------------------------------------------


def list_years(user_id: int) -> list[dict]:
    """Only years that have rows, newest first."""
    return db.query(
        """
        SELECT EXTRACT(YEAR FROM work_date)::int AS year,
               COUNT(*)::int AS days,
               COALESCE(SUM(total_worked), 0)::int AS total_worked
        FROM timesheet WHERE user_id = %s
        GROUP BY 1 ORDER BY 1 DESC
        """,
        (user_id,),
    )


def list_months(user_id: int, year: int) -> list[dict]:
    """Only months of that year that have rows, in calendar order. `days` counts every row;
    `work_days` only the ones with hours, so a month of leave does not read as a month worked."""
    return db.query(
        """
        SELECT EXTRACT(MONTH FROM work_date)::int AS month,
               COUNT(*)::int AS days,
               COUNT(*) FILTER (WHERE day_type = 'WORK')::int AS work_days,
               COUNT(*) FILTER (WHERE day_type <> 'WORK')::int AS days_off,
               COALESCE(SUM(total_worked), 0)::int AS total_worked,
               COUNT(*) FILTER (WHERE onsite)::int AS onsite_days
        FROM timesheet
        WHERE user_id = %s AND work_date >= make_date(%s, 1, 1) AND work_date < make_date(%s + 1, 1, 1)
        GROUP BY 1 ORDER BY 1
        """,
        (user_id, year, year),
    )


def list_month(user_id: int, year: int, month: int) -> list[dict]:
    """A month's rows in date order."""
    if not 1 <= month <= 12:
        return []

    return db.query(
        f"""
        SELECT {_COLUMNS} FROM timesheet
        WHERE user_id = %s
          AND work_date >= make_date(%s, %s, 1)
          AND work_date < make_date(%s, %s, 1) + INTERVAL '1 month'
        ORDER BY work_date
        """,
        (user_id, year, month, year, month),
    )


def list_year(user_id: int, year: int) -> list[dict]:
    """A year's rows in date order, for the export."""
    return db.query(
        f"""
        SELECT {_COLUMNS} FROM timesheet
        WHERE user_id = %s AND work_date >= make_date(%s, 1, 1) AND work_date < make_date(%s + 1, 1, 1)
        ORDER BY work_date
        """,
        (user_id, year, year),
    )
