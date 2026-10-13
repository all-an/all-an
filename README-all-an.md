# all-an

Python, Flask, Jinja2 and HTMX on PostgreSQL. One gunicorn process serves the pages and the API;
no Node anywhere, no build step, and no Docker in the deploy path.

Write timed quizzes on any subject, publish them to the shared pool, and see how you did.

```
                    gunicorn  →  Flask (all_an)
┌──────────────────────────────────────────────────────────────┐
│  /healthz   /api/*   /static/*   pages (Jinja2 + HTMX)       │
└──────────────────────────────────────────────────────────────┘
                              │
                     PostgreSQL (psycopg)
```

Every page is rendered on the server, so the first response already has the right nav and the
right data. HTMX swaps in just the part of the page an action changes — a filter, a button, a form
with its errors — so there is almost no JavaScript to write: about 45 lines for the quiz
countdown, and a few for local dates. Everything else is attributes in the templates.

## Quick start

```bash
cp .env.example .env
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/gunicorn all_an.wsgi:app --reload --bind 127.0.0.1:4200    # http://localhost:4200
```

You need Python 3.12 or newer and a Postgres database called `all-an-database`. Migrations apply
themselves as the app starts, before it serves a request, so there is no separate setup step.

### The virtual environment

The commands above call `.venv/bin/...` directly, so activating is optional. Activate it when you
want plain `python`, `pip`, `pytest` and `gunicorn` to resolve to the project's copies:

```bash
source .venv/bin/activate       # macOS / Linux — the prompt now starts with (.venv)
deactivate                      # leave it; works the same from any directory
```

On Windows (PowerShell) it is `.venv\Scripts\Activate.ps1`; `deactivate` is the same. Activation
only affects the current terminal, so a new terminal starts without it.

### Postgres in a container

The deployment uses no Docker at all — this is purely a local convenience, so you do not have to
install Postgres to work on the app. If you already have it, `createdb all-an-database` is enough
and you can skip this.

```bash
docker run -d --name all-an-db \
  -e POSTGRES_USER=allan \
  -e POSTGRES_PASSWORD=allan \
  -e POSTGRES_DB=all-an-database \
  -p 5432:5432 \
  postgres:17-alpine
```

Those three values are exactly what `DATABASE_URL` in `.env.example` expects, so nothing needs
changing after the copy above.

Day to day:

```bash
docker start all-an-db          # after a reboot
docker stop all-an-db
docker logs all-an-db           # when connections are being refused
docker exec -it all-an-db psql -U allan -d all-an-database   # a psql prompt
```

Without a volume the data lives in the container's own filesystem: `docker stop` and `start` keep
it, `docker rm` throws it away. That is usually what you want here, since the migrations rebuild
the schema and the seed quizzes from nothing. To start over deliberately:

```bash
docker rm -f all-an-db          # then run the docker run above again
```

Or, keeping the container, drop just the database:

```bash
docker exec all-an-db psql -U allan -d postgres \
  -c 'DROP DATABASE "all-an-database";' \
  -c 'CREATE DATABASE "all-an-database" OWNER allan;'
```

If you want the data to outlive the container, add `-v all-an-db-data:/var/lib/postgresql/data` to
the `docker run`.

`docs/dev-build.md` has the rest — tests, migrations, and where things live.

## What it does

**Quizzes.** A quiz is filed under a curated *study field* (Languages, Mathematics, History &
geography, …) and a free-text *subject* of your choosing. Its questions are multiple choice or
type-the-answer, each with its own time limit.

**Taking one.** Questions arrive one at a time against a countdown. Marking and timing are decided
by the server — the answer key never reaches the browser before you have answered, and running out
of time scores the question wrong even if what you typed was right. Typed answers ignore case,
stray spaces and a trailing full stop, because someone who writes `Bought.` knows the answer.

**Publishing.** Publish a quiz to the shared pool so anyone can take it, or unpublish it to keep
it private again.

**Timesheet.** A phone-friendly log of the hours you work: one line per day by month and year,
with the daily minimum, an overtime balance, an on-site target review and CSV export. See
[`docs/timesheet.md`](docs/timesheet.md).

**Results.** Every attempt is kept, with your answer, the right answer and how long you took.

**Site settings.** An administrator gets an `/admin` page holding switches that take effect without
a deploy. There is one so far: closing registration, which stops new accounts while leaving every
existing one able to sign in.

## Layout

```
requirements.txt  requirements-dev.txt
gunicorn.conf.py  workers and threads; the start command is just  gunicorn all_an.wsgi:app
railway.json     Railway start command and health check
db/migration/     schema, in order — read by the migrator at startup
all_an/
├── __init__.py   create_app(): config, pool, migrations, blueprints, error handlers
├── wsgi.py       app = create_app()
├── db.py         connection pool and query helpers (plain SQL, no ORM)
├── migrate.py    the schema_history migrator
├── auth/         passwords (scrypt), sessions, throttles, login_required, routes
├── quizzes/      repo.py (SQL), service.py (rules), api.py, pages.py, editor.py
├── attempts/     service.py (the server-side clock), api.py, pages.py
├── timesheet.py  timesheet_stats.py  timesheet_web.py  timesheet_export.py
├── messages.py  settings.py  users.py  grading.py
├── site.py       about, the contact form and the admin settings page
├── security.py   CSRF and the client's address
├── templates/    base.html, pages, and partials/ — the fragments HTMX swaps
└── static/       css (one file per page), htmx.min.js, runner.js, app.js
tests/            unit, route, browser (e2e) and contract tests
```

## Commands

| | |
|---|---|
| `gunicorn all_an.wsgi:app --reload` | Run it (reloads on code changes) |
| `pytest` | Everything: unit, route and browser tests |
| `pytest -m "not e2e"` | Skip the browser tests (about 70 s → 25 s) |
| `pytest tests/e2e` | Only the browser tests, in headless Chromium |
| `playwright install chromium` | One-time, for the browser tests |

## Documentation

- [`docs/dev-build.md`](docs/dev-build.md) — running it locally, tests, adding migrations
- [`docs/prod-build.md`](docs/prod-build.md) — deploying, configuration
- [`docs/timesheet.md`](docs/timesheet.md) — the timesheet: screens, rules, dashboard, export
- [`docs/quizzes.md`](docs/quizzes.md) — the domain: visibility, timing, marking
- [`ROADMAP.md`](ROADMAP.md) — how the rewrite was planned and what each phase found

## A few decisions worth knowing

**Plain SQL, no ORM.** The schema is fixed and shared with the earlier versions, so an ORM would
only re-describe tables that are not going to change. Queries live next to the rules that use them,
in `repo.py` and `service.py`.

**HTMX swaps regions, and the server owns the rules.** Switching a question's type, adding a
choice, filtering a list — each posts the form's current values and gets the region back redrawn.
There is no client-side copy of the validation rules to drift from the real ones.

**CSRF is a double-submit token.** The earlier versions leaned on `SameSite=Lax` and JSON-only
POSTs. HTML forms are a different thing a hostile page can submit, so every mutating request must
echo a token from a cookie only our own pages can read (`all_an/security.py`). HTMX adds the header
to every request itself.

**The server owns the clock.** The countdown in the browser is cosmetic. The time that counts is
measured from when the server first served the question — and both ends of that are read from the
database's clock, so a skew between hosts cannot change who times out.

**Passwords use `scrypt`.** Stored as `scrypt$N$r$p$salt$hash`, a format that predates this
version: accounts created by the Node and Rust versions sign in unchanged (tests verify a hash
written by Node's `crypto.scrypt`, and one written here verifies in Node). The cost is read back
out of the stored string and refused above a ceiling, so raising it later locks no one out and a
forged hash cannot ask for gigabytes.

**Sessions are opaque and stored hashed.** The cookie holds 32 random bytes; the database holds
their SHA-256. A leaked dump grants nobody a login, and deleting a row signs that browser out
immediately. It is the same table as before, so people stay signed in across a cutover.

**Migrations are the existing Flyway-style files.** `db/migration/V<n>__name.sql`, applied in order
inside transactions under a Postgres advisory lock, recorded in `schema_history` with a SHA-256
checksum. An applied migration that has since changed refuses to start. The table and checksum
scheme are the ones the earlier versions used, so an existing database is picked up as it is.

Rewritten from Spring Boot + Angular, then Angular SSR + Express, then Rust, now Flask; the earlier
versions are in the history.
