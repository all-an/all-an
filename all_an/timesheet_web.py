"""The timesheet pages: years, then months, then a month's days, edited in place with HTMX.

A day's form is its own swap target. Saving returns that form again (with the totals recomputed
and a note, or with its errors); adding or deleting returns the whole month body, because the
month's summary changes with it. The server owns every number shown.
"""

import calendar
from datetime import date, timedelta

from flask import Blueprint, abort, make_response, render_template, request

from . import timesheet, timesheet_stats as stats
from .auth.guards import login_required
from .auth.sessions import current_user
from .errors import ApiError
from .web import go

pages = Blueprint("timesheet_pages", __name__)

MIN_YEAR, MAX_YEAR = 2000, 2100
_FORM_FIELDS = ("work_date", "day_type", "start_hour", "start_lunch", "end_lunch", "end_work_hour", "notes")


# --- view models -------------------------------------------------------------------------------


def _clock(value) -> str:
    return value.strftime("%H:%M") if value else ""


def _row_view(row: dict) -> dict:
    """A stored row as the form shows it: strings for the inputs, h:mm for the totals."""
    work_date = row["work_date"]

    return {
        "id": row["id"],
        "work_date": work_date.isoformat(),
        "heading": f"{work_date.strftime('%a')} {work_date.day} {calendar.month_abbr[work_date.month]}",
        "day_type": row["day_type"],
        "start_hour": _clock(row["start_hour"]),
        "start_lunch": _clock(row["start_lunch"]),
        "end_lunch": _clock(row["end_lunch"]),
        "end_work_hour": _clock(row["end_work_hour"]),
        "onsite": row["onsite"],
        "notes": row["notes"] or "",
        "total": timesheet.format_minutes(row["total_worked"]),
        "below": timesheet.format_minutes(row["below_minimum"]),
        "above": timesheet.format_minutes(row["above_minimum"]),
        # The one figure a day's line shows against the minimum: how far over or under it ran.
        "net": stats.signed(row["above_minimum"] - row["below_minimum"]),
        "net_kind": "above" if row["above_minimum"] else "below" if row["below_minimum"] else "even",
    }


def _typed_view(row_id: int | None, default_date: str) -> dict:
    """The form as it was typed, put back so a failed save does not lose it."""
    form = request.form
    view = {name: form.get(name, "") for name in _FORM_FIELDS}
    view.update(
        id=row_id,
        work_date=view["work_date"] or default_date,
        day_type=view["day_type"] or "WORK",
        onsite=form.get("onsite") == "on",
        heading=view["work_date"] or "New day",
        total="", below="", above="",
    )
    return view


def _summary(rows: list[dict]) -> dict:
    work = [r for r in rows if r["day_type"] == "WORK"]

    return {
        "days": len(rows),
        "work_days": len(work),
        "days_off": len(rows) - len(work),
        "onsite_days": sum(1 for r in work if r["onsite"]),
        "total": timesheet.format_minutes(sum(r["total_worked"] for r in work)),
        "above": timesheet.format_minutes(sum(r["above_minimum"] for r in work)),
        "below": timesheet.format_minutes(sum(r["below_minimum"] for r in work)),
    }


def _year_or_404(year: int) -> int:
    if not MIN_YEAR <= year <= MAX_YEAR:
        abort(404)
    return year


def _month_or_404(year: int, month: int) -> tuple[int, int]:
    _year_or_404(year)
    if not 1 <= month <= 12:
        abort(404)
    return year, month


def _parse_date(text: str | None) -> date | None:
    try:
        return date.fromisoformat((text or "").strip())
    except ValueError:
        return None


def _default_new_date(year: int, month: int, rows: list[dict]) -> str:
    """Today when it is in this month, else the first day nobody has filled in."""
    today = date.today()

    if (today.year, today.month) == (year, month):
        return today.isoformat()

    taken = {r["work_date"].day for r in rows}
    first_free = next((d for d in range(1, calendar.monthrange(year, month)[1] + 1) if d not in taken), 1)
    return date(year, month, first_free).isoformat()


def _invalid(html: str, target: str):
    """A form with its errors. The forms normally swap the month body; this one puts the form back
    where it was instead."""
    response = make_response(html, 422)
    response.headers["HX-Retarget"] = target
    response.headers["HX-Reswap"] = "outerHTML"
    return response


def _field_notice(error: ApiError) -> str:
    fields = error.details.get("fields") or {}
    return " ".join(dict.fromkeys(fields.values())) or error.message


# --- the dashboard -----------------------------------------------------------------------------


def _period(totals: dict, target: int) -> dict:
    """A period's totals shown: h:mm strings, the signed net, and the on-site verdict."""
    return {
        **totals,
        "worked": timesheet.format_minutes(totals["total_worked"]),
        "above": timesheet.format_minutes(totals["above_minimum"]),
        "below": timesheet.format_minutes(totals["below_minimum"]),
        "net_text": stats.signed(totals["net"]),
        "balance_text": stats.signed(totals["balance"]) if "balance" in totals else None,
        "review": stats.review(totals["onsite_days"], totals["work_days"], target),
    }


@pages.get("/timesheet/dashboard")
@login_required
def dashboard():
    user_id = current_user()["id"]
    chosen = _parse_date(request.args.get("date"))

    if chosen is None or not MIN_YEAR <= chosen.year <= MAX_YEAR:
        chosen = date.today()

    constants = timesheet.read_constants()
    target = constants["minimumOnsitePercent"]

    week = _period(stats.week_totals(user_id, chosen), target)
    month = _period(stats.month_totals(user_id, chosen), target)
    window = _period(stats.rolling_months(user_id, chosen), target)

    weeks = [
        {**_period(w, target), "label": f"{w['period_start'].day} {calendar.month_abbr[w['period_start'].month]}"}
        for w in stats.weeks_of_year(user_id, chosen.year)
    ]
    months = [
        {**_period(m, target), "label": calendar.month_name[m["period_start"].month], "number": m["period_start"].month}
        for m in stats.months_of_year(user_id, chosen.year)
    ]

    week_start, week_end = stats.week_of(chosen)

    return render_template(
        "timesheet_dashboard.html",
        active="timesheet",
        chosen=chosen.isoformat(),
        year=chosen.year,
        week=week,
        week_label=f"{week_start.day} {calendar.month_abbr[week_start.month]} – {week_end.day} {calendar.month_abbr[week_end.month]}",
        previous_week=(week_start - timedelta(days=7)).isoformat(),
        next_week=(week_start + timedelta(days=7)).isoformat(),
        month=month,
        month_label=f"{calendar.month_name[chosen.month]} {chosen.year}",
        window=window,
        window_label=f"{calendar.month_abbr[window['start'].month]} {window['start'].year} – "
                     f"{calendar.month_abbr[window['end'].month]} {window['end'].year}",
        weeks=weeks,
        months=months,
        target=target,
        minimum=timesheet.format_minutes(constants["minimumMinutes"]),
    )


# --- years and months --------------------------------------------------------------------------


@pages.get("/timesheet")
@login_required
def years():
    items = timesheet.list_years(current_user()["id"])

    return render_template(
        "timesheet.html",
        active="timesheet",
        years=[{**y, "total": timesheet.format_minutes(y["total_worked"])} for y in items],
        today=date.today().isoformat(),
    )


@pages.get("/timesheet/add")
@login_required
def add_day():
    """The date picker on the year and month pages lands here: a row only comes into being once it
    is saved, so this just opens the month it belongs to with the form ready."""
    chosen = _parse_date(request.args.get("date"))

    if chosen is None or not MIN_YEAR <= chosen.year <= MAX_YEAR:
        return go("/timesheet")

    return go(f"/timesheet/{chosen.year}/{chosen.month}?add={chosen.isoformat()}")


@pages.get("/timesheet/<int:year>")
@login_required
def months(year):
    _year_or_404(year)
    items = timesheet.list_months(current_user()["id"], year)

    return render_template(
        "timesheet_year.html",
        active="timesheet",
        year=year,
        months=[
            {**m, "name": calendar.month_name[m["month"]], "total": timesheet.format_minutes(m["total_worked"])}
            for m in items
        ],
        today=date.today().isoformat(),
    )


# --- one month ---------------------------------------------------------------------------------


def _month_context(year: int, month: int, **extra) -> dict:
    rows = timesheet.list_month(current_user()["id"], year, month)
    last = calendar.monthrange(year, month)[1]

    return {
        "year": year,
        "month": month,
        "month_name": calendar.month_name[month],
        "first_day": date(year, month, 1).isoformat(),
        "last_day": date(year, month, last).isoformat(),
        "rows": [_row_view(r) for r in rows],
        "summary": _summary(rows),
        "default_date": _default_new_date(year, month, rows),
        **extra,
    }


@pages.get("/timesheet/<int:year>/<int:month>")
@login_required
def month_page(year, month):
    _month_or_404(year, month)
    context = _month_context(year, month)

    chosen = _parse_date(request.args.get("add"))
    new_row = None

    if chosen and (chosen.year, chosen.month) == (year, month):
        new_row = {**_blank(chosen.isoformat()), "heading": "New day"}

    return render_template("timesheet_month.html", active="timesheet", new_row=new_row, fields={}, **context)


def _blank(work_date: str) -> dict:
    return {
        "id": None, "work_date": work_date, "heading": "New day", "day_type": "WORK",
        "start_hour": "", "start_lunch": "", "end_lunch": "", "end_work_hour": "",
        "onsite": False, "notes": "", "total": "", "below": "", "above": "",
    }


@pages.get("/timesheet/<int:year>/<int:month>/new")
@login_required
def new_row(year, month):
    _month_or_404(year, month)
    context = _month_context(year, month)
    chosen = _parse_date(request.args.get("date"))
    work_date = chosen.isoformat() if chosen and (chosen.year, chosen.month) == (year, month) else context["default_date"]

    return render_template(
        "partials/timesheet_new.html", row=_blank(work_date), fields={}, notice="",
        year=year, month=month, first_day=context["first_day"], last_day=context["last_day"],
    )


@pages.get("/timesheet/<int:year>/<int:month>/new/close")
@login_required
def close_new_row(year, month):
    _month_or_404(year, month)
    return '<div id="new-row"></div>'


def _month_body(year: int, month: int, notice: str = ""):
    """The refreshed list and summary, and the add form put away."""
    html = render_template("partials/timesheet_month_body.html", notice=notice, **_month_context(year, month))
    return html + '<div id="new-row" hx-swap-oob="true"></div>'


@pages.post("/timesheet/<int:year>/<int:month>/rows")
@login_required
def create_row(year, month):
    _month_or_404(year, month)
    user = current_user()

    try:
        created = timesheet.insert(user["id"], request.form)
    except ApiError as error:
        if error.status not in (400, 409):
            raise
        context = _month_context(year, month)
        fields = error.details.get("fields") or {}
        message = _field_notice(error)
        return _invalid(
            render_template(
                "partials/timesheet_new.html",
                row=_typed_view(None, context["default_date"]), fields=fields, notice=message,
                year=year, month=month, first_day=context["first_day"], last_day=context["last_day"],
            ),
            "#new-row",
        )

    # The day may have been moved to another month in the form; follow it there.
    saved = created["work_date"]

    if (saved.year, saved.month) != (year, month):
        return go(f"/timesheet/{saved.year}/{saved.month}")

    return _month_body(year, month, "Day added.")


# --- one day -----------------------------------------------------------------------------------


def _day_context(row: dict, **extra) -> dict:
    work_date = row["work_date"]
    year, month = work_date.year, work_date.month

    return {
        "year": year,
        "month": month,
        "month_name": calendar.month_name[month],
        "first_day": date(year, month, 1).isoformat(),
        "last_day": date(year, month, calendar.monthrange(year, month)[1]).isoformat(),
        **extra,
    }


@pages.get("/timesheet/rows/<int:row_id>")
@login_required
def day_page(row_id):
    """One day in full. The month page lists days as single lines; this is where one is edited."""
    row = timesheet.get(current_user()["id"], row_id)

    return render_template(
        "timesheet_day.html", active="timesheet", row=_row_view(row), fields={}, notice="", **_day_context(row)
    )


@pages.post("/timesheet/rows/<int:row_id>")
@login_required
def save_row(row_id):
    user = current_user()
    existing = timesheet.get(user["id"], row_id)
    year, month = existing["work_date"].year, existing["work_date"].month

    try:
        saved = timesheet.update(user["id"], row_id, request.form)
    except ApiError as error:
        if error.status not in (400, 409):
            raise
        return _invalid(
            render_template(
                "partials/timesheet_day_form.html",
                row=_typed_view(row_id, existing["work_date"].isoformat()),
                fields=error.details.get("fields") or {}, notice=_field_notice(error),
                **_day_context(existing),
            ),
            "#day-form",
        )

    # Back in place, with the totals the save just produced. The back link follows the date, so a
    # day moved to another month is still where you left it.
    return render_template(
        "partials/timesheet_day_form.html", row=_row_view(saved), fields={}, notice="Saved.", **_day_context(saved)
    )


@pages.post("/timesheet/rows/<int:row_id>/delete")
@login_required
def delete_row(row_id):
    user = current_user()
    existing = timesheet.get(user["id"], row_id)
    year, month = existing["work_date"].year, existing["work_date"].month

    timesheet.delete(user["id"], row_id)

    # Back to the month it was in, or the year when that was its last day (an empty month is not listed).
    if timesheet.list_month(user["id"], year, month):
        return go(f"/timesheet/{year}/{month}")

    return go(f"/timesheet/{year}")
