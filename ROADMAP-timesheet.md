# Timesheet roadmap

A signed-in area for logging worked hours day by day, browsing them by year and month, and
reviewing on-site versus remote attendance on a dashboard. Everything is private per user.

Same stack and habits as the rest of the app: Flask + Jinja2 + HTMX, plain SQL in a repo module,
rules in a service module, one CSS file per page, no new dependencies.

## Decisions already made

| Topic | Decision |
|---|---|
| Minimum hours | 8, stored in `timesheet_constants`, one global value |
| Lunch | Optional per row, though almost always filled in |
| Rows | Added one at a time with a **+** button; days are not pre-listed |
| Years / months shown | Only those that have at least one row |
| Devices | Phone first: every timesheet screen must be fully usable on a phone |
| Admins | No special access for now; every user sees only their own rows |
| On-site target | 50% of worked days, stored in `timesheet_constants` |
| Computed columns | Calculated by the server on save and stored in the table, as integer minutes |
| On-site | Controlled by the row's `onsite` column; percentage = on-site days / days logged |
| Review periods | Per calendar month **and** a rolling last-6-months window, both shown |
| Day type | Each row has a `day_type`: `WORK`, `LEAVE`, `HOLIDAY` or `SICK` |
| Overtime balance | Running balance of above minus below minimum, per week and per month, on the dashboard |
| Export | CSV of a month (and of a year) |
| Constant changes | Existing rows keep their saved values; a recompute helper exists |

## Flow

1. **Nav**: a "Timesheet" link, visible only when signed in (also in the hamburger menu).
2. **`/timesheet`**: one card per year that has rows, newest first. A **+** control adds a first
   entry through a date picker, which is also how a brand-new year or month comes into existence.
3. **`/timesheet/<year>`**: one card per month that has rows, each showing days logged and total
   worked hours. A **+** control adds an entry in that year.
4. **`/timesheet/<year>/<month>`**: the month's days in date order, **one line per day**: the
   date, total worked and how far it sits above or below the minimum (a day off shows its type).
   **+ Add day** opens the new-day form here, with the date picker limited to the month.
   Deleting the last day of a month makes that month disappear from the year page.
4b. **`/timesheet/rows/<id>`**: the day page, reached by tapping a line. It holds the whole day
   (date, type, the four times, on site, notes) and its Save and Delete, and links back to the
   month.
5. **`/timesheet/dashboard`**: totals and on-site review (see phase 4). Linked from the year page
   header and from the timesheet landing page.

## Mobile first

The timesheet will mostly be filled in on a phone, so it is designed for a narrow screen first and
widened for desktop, not the other way round.

- **Layout**: single column below 720px (the same breakpoint as the hamburger nav), no horizontal
  page scroll at 360px wide, 16px side gutters.
- **Years and months**: cards stack one per row, large enough to tap (at least 44px tall).
- **Month days**: each day is a single tappable line (date, total, over/under the minimum), so a
  month stays short enough to scan on a phone. The full day lives on its own page: date and day
  type on top, the four times in a 2x2 grid (one row from 720px), totals as small chips, on-site
  toggle and notes. The same cards are used at every width.
- **Entry**: native `type="time"` and `type="date"` inputs so the phone's own pickers appear, with
  `inputmode` and `autocomplete="off"` set sensibly. Inputs are at least 16px font size so iOS
  does not zoom on focus.
- **Adding a day**: the **+** button is reachable with one thumb (a full-width button at the top
  of the month, not a tiny icon), opens the date picker, and defaults to the next unfilled day.
- **Saving**: a tap-friendly Save per row with clear feedback; unsaved changes are visibly marked
  so a day is not lost by navigating away.
- **Dashboard**: summary figures as stacked cards; the weekly and monthly balance tables become
  lists of cards, or scroll inside their own container, rather than widening the page.
- **Touch targets**: buttons and toggles at least 44x44px with spacing between destructive and
  other actions; delete asks for confirmation.
- **Verification**: each page is checked at 360px, 390px and desktop widths, and the browser
  (e2e) tests run the add, edit and dashboard flows with a phone-sized viewport.

## Data model

New migration `V10__create_timesheet.sql`. Existing migrations are never edited, because their
checksums are verified at startup.

**`timesheet`**, one row per user per day

| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `user_id` | BIGINT FK `users` | `ON DELETE CASCADE` |
| `work_date` | DATE | `UNIQUE (user_id, work_date)` |
| `day_type` | TEXT | `WORK` (default), `LEAVE`, `HOLIDAY`, `SICK`; `CHECK` constraint |
| `start_hour` | TIME NULL | optional (V11); a day without both start and end counts as 0 worked |
| `start_lunch` | TIME NULL | |
| `end_lunch` | TIME NULL | |
| `end_work_hour` | TIME NULL | optional (V11); a day without both start and end counts as 0 worked |
| `below_minimum` | INTEGER | minutes, computed |
| `above_minimum` | INTEGER | minutes, computed |
| `total_worked` | INTEGER | minutes, computed |
| `onsite` | BOOLEAN | default false |
| `notes` | TEXT NULL | length-capped in validation |

Constraints: lunch times are both set or both null; `CHECK` on ordering where all are present.
Index on `(user_id, work_date)` comes from the unique key and serves year, month and week reads.

**`timesheet_constants`**, key/value in the style of `app_settings`

| key | value | meaning |
|---|---|---|
| `minimum_hours` | `8` | daily minimum worked time |
| `minimum_onsite_percent` | `50` | share of worked days that should be on site |

Seeded in the same migration, read through one function that falls back to the defaults if a row
is missing, so a deleted row cannot break the page.

## Calculation rules (server-owned)

- `total_worked = (end_work_hour - start_hour) - (end_lunch - start_lunch)`, in minutes; the
  lunch term is zero when lunch is empty.
- `below_minimum = max(minimum - total_worked, 0)`
- `above_minimum = max(total_worked - minimum, 0)`
- A non-`WORK` day (`LEAVE`, `HOLIDAY`, `SICK`) has no times and no on-site flag: its three
  computed columns are 0 and `onsite` is false. It shows in the month but is neutral everywhere
  else: not a day logged for the on-site percentage, and no below-minimum shortfall.
- Recomputed whenever a row is saved. If the minimum constant changes later, existing rows keep
  the values they were saved with, and a one-line recompute helper exists for that case.
- Changing `day_type` to a non-`WORK` value clears the times and zeroes the computed columns.
- Validation: `start_hour < start_lunch < end_lunch < end_work_hour`, no lunch half-set, no
  negative totals, date is a real date, one row per day (a duplicate is a clear field error).
- Display is `h:mm`; inputs are `HH:MM` time fields.

## Dashboard rules

Per user, from their own rows only.

- **Worked total** for a chosen week (Monday to Sunday) or month, with days logged and the
  above/below-minimum sums.
- **On-site days by month**: days with `onsite = true`, days logged, and the percentage.
- **On-site target review**: the percentage is compared to `minimum_onsite_percent` for
  - each calendar month, and
  - a rolling window of the last 6 months (this month and the 5 before it).
  Each is shown as met / not met with the gap in days ("needs 2 more on-site days").
- Denominator is `WORK` days logged in the period; leave, holiday and sick days are excluded.
- Leave days are listed separately in the month totals ("2 leave, 1 holiday") so the month still
  accounts for every day.

### Overtime balance

- Per day: `above_minimum - below_minimum`, `WORK` days only.
- **Per week**: the week's net (sum of its days) and a running balance accumulated from the first
  week of the selected year.
- **Per month**: the month's net and a running balance accumulated from January of the selected
  year.
- Shown as signed `h:mm` ("+6:30", "-1:15"), with the year selector on the dashboard deciding
  where the running balance starts. Computed in SQL with window functions over the aggregates.

### CSV export

- `GET /timesheet/<year>/<month>/export.csv` and `GET /timesheet/<year>/export.csv`, signed-in
  users only and always their own rows.
- Columns: date, day type, start, start lunch, end lunch, end, total worked, below minimum,
  above minimum, on site, notes. Times as `HH:MM`, durations as `h:mm`.
- Served with a `Content-Disposition` filename such as `timesheet-2026-03.csv`; notes are quoted
  and any cell starting with `=`, `+`, `-` or `@` is prefixed so a spreadsheet does not run it as
  a formula.

## Phases

### Phase 1: schema and service
- `V10__create_timesheet.sql` with both tables and the seeded constants.
- `all_an/timesheet.py`: repo functions (list years, list months of a year, list rows of a month,
  insert, update, delete, week/month aggregates) and the pure calculation function.
- Unit tests for the calculation: with and without lunch, below, at and above the minimum, bad
  ordering, half-set lunch, and non-`WORK` day types zeroing everything.
- Migration test updated: seeded constants exist, tables build from nothing.

### Phase 2: pages
- `all_an/timesheet_web.py` blueprint, all routes `login_required`.
- Templates: `timesheet.html` (years), `timesheet_year.html` (months), `timesheet_month.html`
  (rows), with partials for a row, an editable row and the add-row form.
- `static/css/timesheet.css`, reusing the card and button styles from `page.css`, written
  mobile first (base styles are the phone layout, `min-width` media queries widen it).
- Route tests: access control (signed out is sent to sign in, another user's rows are a 404),
  empty states, year and month listing from real rows, add, edit, delete, validation errors kept
  in the form.

### Phase 3: navigation
- "Timesheet" link in `base.html`, active-state handling, hamburger menu included.
- Landing page empty state that explains the **+** control.

### Phase 4: dashboard
- `/timesheet/dashboard` with week and month pickers, totals, on-site table by month and the
  50% review for month and 6-month windows.
- Overtime balance per week and per month with the running total (see above).
- Aggregation done in SQL, percentage and gap rules in the service so they can be unit tested.
- Tests: totals for a known set of rows, on-site percentage, target met and not met, empty
  periods, leave days excluded from the percentage, running balance across weeks and months
  (including a negative balance and a year boundary).

### Phase 4b: export
- The two CSV routes, with tests for ownership, quoting, formula neutralisation and the
  filename.

### Phase 5: docs and polish
- `docs/timesheet.md` for the rules above, README layout and nav sections updated.
- Browser (e2e) test, run with a phone-sized viewport and again at desktop width: add rows, see
  year and month appear, dashboard numbers match, no horizontal page scroll.
- Walk every screen at 360px and 390px wide and on desktop; fix overflow, tap size and zoom
  issues found.

## Open points

None. Public holidays and leave, overtime balance and export are now part of the plan.
