"""The numbers behind the timesheet dashboard: totals for a period, the overtime balance, and the
on-site review against the target in timesheet_constants.

Only WORK days count anywhere here. Leave, holiday and sick days hold no hours and no on-site
flag, so they are neither worked nor a day that should have been on site.
"""

import calendar
from datetime import date, timedelta

from . import db, timesheet

_AGGREGATES = """
    COUNT(*) FILTER (WHERE day_type = 'WORK')::int            AS work_days,
    COUNT(*) FILTER (WHERE day_type <> 'WORK')::int           AS days_off,
    COUNT(*) FILTER (WHERE day_type = 'WORK' AND onsite)::int AS onsite_days,
    COALESCE(SUM(total_worked), 0)::int                       AS total_worked,
    COALESCE(SUM(above_minimum), 0)::int                      AS above_minimum,
    COALESCE(SUM(below_minimum), 0)::int                      AS below_minimum
"""


def signed(minutes: int) -> str:
    """+6:30, -1:15 and 0:00: a balance reads wrong without its sign."""
    if minutes > 0:
        return "+" + timesheet.format_minutes(minutes)
    return timesheet.format_minutes(minutes)


# --- the on-site review ------------------------------------------------------------------------


def review(onsite_days: int, work_days: int, target_percent: int) -> dict:
    """Whether a period met the on-site target, and how many more on-site days it would have taken.

    Integer maths throughout: 3 of 6 days against 50% is exactly met, with no float to wobble.
    A period with no worked days has nothing to judge.
    """
    if work_days == 0:
        return {"percent": None, "target": target_percent, "met": None, "needed": 0}

    needed = max(-(-target_percent * work_days // 100) - onsite_days, 0)  # ceiling division

    return {
        "percent": round(onsite_days * 100 / work_days),
        "target": target_percent,
        "met": onsite_days * 100 >= target_percent * work_days,
        "needed": needed,
    }


# --- period totals -----------------------------------------------------------------------------


def _totals(user_id: int, start: date, end: date) -> dict:
    """Everything between two dates, both included."""
    row = db.query_one(
        f"SELECT {_AGGREGATES} FROM timesheet WHERE user_id = %s AND work_date BETWEEN %s AND %s",
        (user_id, start, end),
    )
    return {**row, "net": row["above_minimum"] - row["below_minimum"], "start": start, "end": end}


def week_of(day: date) -> tuple[date, date]:
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=6)


def month_of(day: date) -> tuple[date, date]:
    return day.replace(day=1), day.replace(day=calendar.monthrange(day.year, day.month)[1])


def week_totals(user_id: int, day: date) -> dict:
    return _totals(user_id, *week_of(day))


def month_totals(user_id: int, day: date) -> dict:
    return _totals(user_id, *month_of(day))


def _months_back(day: date, months: int) -> date:
    """The first of the month `months` before day's month."""
    index = day.year * 12 + day.month - 1 - months
    return date(index // 12, index % 12 + 1, 1)


def rolling_months(user_id: int, day: date, months: int = 6) -> dict:
    """The month of `day` and the ones before it, `months` in all."""
    start = _months_back(day, months - 1)
    return _totals(user_id, start, month_of(day)[1])


# --- a year, by week and by month with the running balance ------------------------------------


def _grouped(user_id: int, year: int, unit: str) -> list[dict]:
    """One row per week or month that has any days, with the balance carried along.

    The running balance is a window function over the grouped rows, so it starts at the first row
    of the year and needs no second pass.
    """
    return db.query(
        f"""
        WITH grouped AS (
            SELECT date_trunc('{unit}', work_date)::date AS period_start,
                   {_AGGREGATES}
            FROM timesheet
            WHERE user_id = %s AND work_date >= make_date(%s, 1, 1) AND work_date < make_date(%s + 1, 1, 1)
            GROUP BY 1
        )
        SELECT *, (SUM(above_minimum - below_minimum) OVER (ORDER BY period_start))::int AS balance
        FROM grouped
        ORDER BY period_start
        """,
        (user_id, year, year),
    )


def _with_net(rows: list[dict]) -> list[dict]:
    return [{**r, "net": r["above_minimum"] - r["below_minimum"]} for r in rows]


def weeks_of_year(user_id: int, year: int) -> list[dict]:
    return _with_net(_grouped(user_id, year, "week"))


def months_of_year(user_id: int, year: int) -> list[dict]:
    return _with_net(_grouped(user_id, year, "month"))
