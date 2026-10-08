# Dev build — running all-an locally

One process serves everything: Flask renders the pages, HTMX swaps parts of them, and the JSON API
lives in the same app. There is no second service to start and no proxy to configure.

## What you need

- **Python 3.12 or newer.**
- **Postgres**, with a database called `all-an-database`.

## Postgres

If you have Postgres installed:

```bash
createdb all-an-database
```

If you would rather not install it, a container works and is purely a dev convenience — nothing
about the deployment uses Docker:

```bash
docker run -d --name all-an-db \
  -e POSTGRES_USER=allan -e POSTGRES_PASSWORD=allan -e POSTGRES_DB=all-an-database \
  -p 5432:5432 postgres:17-alpine
```

## Set up and run

```bash
cp .env.example .env
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/gunicorn all_an.wsgi:app --reload --bind 127.0.0.1:4200
```

<http://localhost:4200> serves the pages, and `/api` the API — same port, same origin, no CORS.

`.env` is gitignored and loaded at startup. Every variable is documented in `.env.example`; only
`DATABASE_URL` is required.

**Migrations run as the app starts.** A fresh database is ready without a separate step, and a
migration that fails stops the worker booting rather than serving a half-built schema. With
several workers each one tries; a Postgres advisory lock makes the second a no-op.

**Templates and static files reload** with `--reload` (and Flask re-reads templates only when the
worker restarts). Edit, save, refresh.

## Tests

```bash
pip install -r requirements-dev.txt
pytest                      # everything
pytest -m "not e2e"         # skip the browser tests
```

They need a Postgres server whose user may `CREATE DATABASE` — the local container above works with
no setup (override with `TEST_DATABASE_URL`). Each test gets its own database, cloned in
milliseconds from one that is migrated once per run, and dropped afterwards; your dev data is never
touched.

What is covered, roughly in order of how much a bug would hurt:

- **Grading, passwords, the migrator** — pure and fast. Includes a password hash written by the
  Node version, and a copy of the real dev database to prove its migration checksums are accepted.
- **Auth, throttles, CSRF, access rules** — through Flask's test client.
- **Every page and fragment** — the HTML an HTMX request gets back, not just the status.
- **`tests/e2e/`** — headless Chromium against a live server. These are the tests that prove the
  HTMX attributes in the templates do what the others assume. One-time setup:
  `playwright install chromium` (skipped automatically if the browser is missing).

### The contract check

`tests/contract/run.py` replays one scripted conversation against a base URL and prints a
normalised transcript, so two builds can be compared:

```bash
python tests/contract/run.py http://localhost:4200 > before.json
python tests/contract/run.py http://localhost:4300 > after.json
diff before.json after.json
```

It creates and removes its own `ct_*` users, so it is safe to point at a development database but
not at production. It is how the Flask rewrite was checked against the Rust build it replaced.

## Adding a migration

Add `db/migration/V<n>__<name>.sql` and restart. The runner applies whatever `schema_history` has
not seen, each file in its own transaction, holding a Postgres advisory lock so two instances
deploying at once cannot both apply it.

**Applied migrations are immutable.** The runner records a checksum and refuses to start if a file
that already ran has since been edited, because at that point the database and the repository
disagree about what `V<n>` means. Fix a mistake with a new migration, not by editing the old one.

The exception is a database you are willing to throw away — locally, drop it and let the migrations
rebuild it:

```bash
psql -d postgres -c 'DROP DATABASE "all-an-database";' -c 'CREATE DATABASE "all-an-database";'
```

## Where things live

| Path | What |
|---|---|
| `db/migration/` | Schema, in order |
| `all_an/db.py`, `migrate.py` | The pool, query helpers, the migration runner |
| `all_an/auth/` | Passwords, sessions, throttles, the `login_required` guards |
| `all_an/quizzes/` | `repo.py` SQL · `service.py` rules · `api.py` JSON · `pages.py` lists · `editor.py` |
| `all_an/attempts/` | Taking a quiz: the clock, marking, results |
| `all_an/templates/` | `base.html`, pages, and `partials/` — the fragments HTMX swaps in |
| `all_an/static/` | CSS per page, `htmx.min.js`, `runner.js` (the countdown), `app.js` (local dates) |
