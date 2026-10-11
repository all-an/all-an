"""CSV of a month or a year of the signed-in user's timesheet."""

import csv
import io

from flask import Blueprint, abort, make_response

from . import timesheet
from .auth.guards import login_required
from .auth.sessions import current_user

pages = Blueprint("timesheet_export", __name__)

HEADER = [
    "Date", "Day type", "Start", "Lunch out", "Lunch back", "End",
    "Total worked", "Below minimum", "Above minimum", "On site", "Notes",
]

# A cell that starts with one of these is read by a spreadsheet as a formula, and notes are free text.
_FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: str) -> str:
    """Text a spreadsheet will show as typed rather than run: a leading apostrophe is the
    convention, and it is not displayed by Excel or Sheets."""
    return "'" + value if value.startswith(_FORMULA_STARTS) else value


def _clock(value) -> str:
    return value.strftime("%H:%M") if value else ""


def to_csv(rows: list[dict]) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(HEADER)

    for row in rows:
        writer.writerow(
            [
                row["work_date"].isoformat(),
                row["day_type"].capitalize(),
                _clock(row["start_hour"]),
                _clock(row["start_lunch"]),
                _clock(row["end_lunch"]),
                _clock(row["end_work_hour"]),
                timesheet.format_minutes(row["total_worked"]),
                timesheet.format_minutes(row["below_minimum"]),
                timesheet.format_minutes(row["above_minimum"]),
                "yes" if row["onsite"] else "no",
                safe_cell(row["notes"] or ""),
            ]
        )

    return out.getvalue()


def _download(rows: list[dict], name: str):
    # The BOM lets Excel read the file as UTF-8 instead of guessing a code page.
    response = make_response("﻿" + to_csv(rows))
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = f'attachment; filename="{name}"'
    response.headers["Cache-Control"] = "no-store"
    return response


@pages.get("/timesheet/<int:year>/export.csv")
@login_required
def export_year(year):
    if not 2000 <= year <= 2100:
        abort(404)

    return _download(timesheet.list_year(current_user()["id"], year), f"timesheet-{year}.csv")


@pages.get("/timesheet/<int:year>/<int:month>/export.csv")
@login_required
def export_month(year, month):
    if not (2000 <= year <= 2100 and 1 <= month <= 12):
        abort(404)

    return _download(
        timesheet.list_month(current_user()["id"], year, month), f"timesheet-{year}-{month:02d}.csv"
    )
