# Timesheet

A signed-in area for logging worked hours day by day, browsing them by year and month, and
reviewing overtime and on-site attendance. Everything is private to the person who wrote it.

## Screens

| Path | What it is |
|---|---|
| `/timesheet` | The years that have rows, newest first, and a date picker to add a day |
| `/timesheet/<year>` | The months of that year that have rows |
| `/timesheet/<year>/<month>` | The month's days, one line each (date, total, over/under the minimum), with a summary |
| `/timesheet/rows/<id>` | One day in full: type, the four times, on site, notes |
| `/timesheet/dashboard?date=` | Totals, on-site review and overtime balance |
| `/timesheet/<year>/export.csv`, `/timesheet/<year>/<month>/export.csv` | Download |

A day only exists once it is saved. The date picker on the year and month pages opens that
month with the new-day form ready. A year or month appears in the lists only while it has rows.

Every screen is built for a phone first: one column, 44px tap targets, 16px inputs so iOS does not
zoom, and native date and time pickers.

## Data

`timesheet` holds one row per person per day (unique on `user_id, work_date`).

| Column | Meaning |
|---|---|
| `day_type` | `WORK`, `LEAVE`, `HOLIDAY` or `SICK` |
| `start_hour`, `start_lunch`, `end_lunch`, `end_work_hour` | Times; lunch is optional but both or neither |
| `total_worked`, `below_minimum`, `above_minimum` | Whole minutes, calculated by the server on save |
| `onsite` | Worked on site that day |
| `notes` | Free text, up to 500 characters |

Durations are integer minutes: 7h45m is exactly 465, and a month sums without rounding drift.
Pages show them as `h:mm`; balances carry a sign (`+6:30`, `-1:15`).

`timesheet_constants` is key/value, in the style of `app_settings`:

| Key | Default | Meaning |
|---|---|---|
| `minimum_hours` | `8` | Daily minimum (decimals allowed, `7.5`) |
| `minimum_onsite_percent` | `50` | Share of worked days that should be on site |

A missing or unreadable value falls back to the default rather than failing a page. There is no
screen for the constants yet; change them with SQL:

```sql
UPDATE timesheet_constants SET value = '7.5' WHERE key = 'minimum_hours';
```

## Rules

- `total_worked = (end - start) - (end lunch - start lunch)`.
- `below_minimum = max(minimum - total, 0)`, `above_minimum = max(total - minimum, 0)`.
- Times must run in order (start, lunch out, lunch back, end).
- A day that is not `WORK` keeps no times and is not on site, and its computed columns are 0.
  It appears in the month but is neutral for the minimum and for the on-site percentage.
- Changing `minimum_hours` does not touch saved rows. `timesheet.recompute()` brings them up to
  date when you want that (non-work days are left alone).

## Dashboard

For the date you pick (today by default):

- **Week** (Monday to Sunday) and **month**: worked time, worked days, on-site days, net against
  the minimum, and the on-site verdict.
- **Last 6 months**: the month and the five before it, with the same figures.
- **The year by month and by week**: each with its net and a running balance accumulated from the
  first period of the year.

The on-site verdict is on-site days over worked days against `minimum_onsite_percent`, in integer
maths so exactly 50% of 6 days is met. When it is not met it says how many more on-site days it
would have taken. Leave, holiday and sick days are not counted as days that should have been on site.

## Export

CSV, UTF-8 with a byte-order mark so Excel reads it correctly. Columns: date, day type, start,
lunch out, lunch back, end, total worked, below minimum, above minimum, on site, notes. A note that
starts with `=`, `+`, `-` or `@` is prefixed with an apostrophe so a spreadsheet shows it as text
instead of running it.

## Where things live

```
db/migration/V10__create_timesheet.sql   both tables and the seeded constants
all_an/timesheet.py                      the rules, validation and row queries
all_an/timesheet_stats.py                dashboard totals, balances and the on-site review
all_an/timesheet_web.py                  the pages
all_an/timesheet_export.py               the CSV downloads
all_an/templates/timesheet*.html         pages; partials/timesheet_*.html are the HTMX fragments
all_an/static/css/timesheet.css          mobile-first styles
```
