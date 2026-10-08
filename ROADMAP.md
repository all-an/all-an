# Roadmap — rewriting all-an in Python + Flask + Jinja2 + HTMX

Branch: `flask-rewrite`. Starting point: the current Rust (axum + Askama + vanilla JS) app on `main`.

**Stack:** Python, Flask, Jinja2, PostgreSQL, HTMX.
**Same database.** The existing Postgres schema, data, sessions and password hashes carry over
untouched. Nothing in `db/migration/` is edited; the Python app is a new client of the same tables.
**Render commands:**

```
pip install -r requirements.txt
gunicorn all_an.wsgi:app
```

> `gunicorn your_application.wsgi` on its own will not start a Flask app: gunicorn needs
> `module:callable`. We use the package `all_an` with a `wsgi.py` exposing `app`, so the start
> command is `gunicorn all_an.wsgi:app`. Everything else in this document assumes that.

## Principles

1. **Behaviour parity first.** The current app is the specification. Same URLs, same rules, same
   error messages, same JSON for `/api`. No feature work until the rewrite reaches parity.
2. **HTMX replaces the hand-written JavaScript.** Pages are server-rendered Jinja2; interactions
   swap HTML fragments. Hand-written JS is allowed only where HTMX cannot do the job (the quiz
   countdown), and stays small.
3. **No ORM.** Plain SQL through `psycopg` (v3) with a connection pool. The queries already exist
   in `src/*.rs` and port nearly line for line; an ORM would only re-map a schema that is fixed.
4. **The database is not migrated, it is adopted.** The Python migrator must read the existing
   `schema_history` table and accept the existing checksums.
5. **Every phase ends runnable.** Each phase leaves the app in a state that can start and pass its
   own checks, so the branch never goes dark for weeks.

## Decisions to confirm before Phase 1

| Question | Recommendation |
|---|---|
| Keep the JSON `/api`? | Keep it for parity during the rewrite (it is the easiest thing to test against the Rust app), then decide in Phase 8 whether anything still needs it. |
| Flask blueprints layout? | One blueprint per domain (`auth`, `quizzes`, `attempts`, `friends`, `shares`, `messages`, `settings`). |
| Python version | 3.12, pinned with `PYTHON_VERSION` in `render.yaml`. |
| Sync vs async | Sync Flask + gunicorn `gthread` workers. Nothing here needs async. |
| CSRF | Add Flask-WTF-style CSRF tokens for HTMX form posts (see Phase 2). The Rust app relied on `SameSite=Lax` and JSON-only POSTs; HTML form posts change that. |

## Target layout

```
requirements.txt
render.yaml
db/migration/            unchanged — read by the Python migrator at startup
all_an/
├── __init__.py          create_app(): config, pool, blueprints, error handlers
├── wsgi.py              app = create_app()  →  gunicorn all_an.wsgi:app
├── config.py            environment → settings
├── db.py                pool, query helpers, transaction()
├── migrate.py           schema_history runner (advisory lock, checksums)
├── auth/                passwords (scrypt), sessions, throttle, decorators
├── quizzes/  attempts/  friends/  shares/  messages/  settings/
├── mail.py              Resend over HTTP
├── grading.py           pure functions, unit-tested
├── templates/           base.html, pages, and partials/ for HTMX fragments
└── static/              css (carried over), htmx.min.js, a little JS
tests/
```

## Phases

### Phase 0 — Scaffolding (½ day) ✅
- `requirements.txt`: `Flask`, `gunicorn`, `psycopg[binary,pool]`, `python-dotenv`, `requests`
  (Resend), `pytest`.
- `all_an/__init__.py` with `create_app()`, `wsgi.py`, `config.py` (same environment variables as
  today: `DATABASE_URL`, `PORT`, `TRUST_PROXY_HEADERS`, `SESSION_COOKIE_SECURE`, `SITE_URL`,
  `ADMIN_*`, `RESEND_API_KEY`, `MAIL_FROM`).
- `GET /healthz` that runs `SELECT 1` and returns 503 on failure.
- `.env.example`, `.gitignore` (`__pycache__`, `.venv`), `docs/dev-build.md` skeleton.

**Done when:** `gunicorn all_an.wsgi:app` starts locally against the dev database and `/healthz`
returns `{"status": "ok"}`.

### Phase 1 — Database layer and migrator (1 day) ✅
- `db.py`: `psycopg_pool.ConnectionPool` (max 10), SSL rule copied from the Rust version:
  `localhost`, `127.0.0.1` and single-label hostnames → no TLS; anything else → `sslmode=require`.
- `migrate.py`: port of `src/db.rs`.
  - `CREATE TABLE IF NOT EXISTS schema_history (...)` exactly as today.
  - `pg_advisory_lock(4120724)` on one connection.
  - Checksum = SHA-256 hex of the file's UTF-8 text; refuse to start if an applied migration's
    checksum differs; apply pending ones each in its own transaction.
- Run the migrator before the app accepts traffic. With gunicorn that means a `when_ready` /
  pre-fork hook or a guarded call in `create_app()` — the advisory lock already makes concurrent
  workers safe, but the migrator must finish before the first request.
- Bootstrap admin from `ADMIN_*`; sweep expired sessions.

**Done when:** pointing the new app at the current dev database reports "9 migrations, 0 newly
applied", and pointing it at an empty database builds the full schema and seed quizzes.

### Phase 2 — Auth, sessions, throttles (1–2 days) ✅
- **Passwords:** `hashlib.scrypt` with `n=16384, r=8, p=1, dklen=64, maxmem=64 MiB`. Format
  `scrypt$N$r$p$salt$hash` with unpadded base64url, **identical** to today. Read parameters back
  from the stored string and refuse `N` above 2^16. Constant-time compare with `hmac.compare_digest`.
  Keep the dummy-hash trick so unknown usernames cost the same time.
- **Sessions:** cookie `sid` = 32 random bytes (base64url); table stores SHA-256 hex. 30-day TTL,
  `HttpOnly`, `SameSite=Lax`, `Secure` from `SESSION_COOKIE_SECURE`. Use our own table, not Flask's
  signed-cookie session, so existing logged-in users stay logged in across the cutover.
- **Throttles:** 3 signups/day/IP; 5 login failures/15 min/IP with `retryAfterSeconds`.
- **Client IP:** with `TRUST_PROXY_HEADERS=true`, the **last** `X-Forwarded-For` entry; otherwise the
  socket address. Do not use `ProxyFix` with a larger hop count.
- **Decorators:** `@login_required`, `@admin_required` (HTML routes redirect to
  `/login?next=...`; `/api` routes return 401/403 JSON).
- **CSRF:** a per-session token rendered into forms and sent by HTMX via `hx-headers`; reject
  mutating requests without it.
- Pages: `/login`, `/register` (closed-registration notice), logout; `POST /api/auth/*`.

**Done when:** a user created by the Rust app logs in on the Flask app with the same password; a
hash created by Flask verifies in the Rust app (check both directions before the cutover); the
throttles reproduce the existing messages and limits.

### Phase 3 — Quizzes: lists, filters, archive (2 days)
- Port `quizzes.rs` queries and rules: `readable` / `writable` / `authored`, visibility,
  per-user archives, study fields, subjects.
- Pages: front, **browse** (`/quizzes/browse[/<slug>]`), **my quizzes** (`/quizzes`).
- **HTMX:** filter chips are `hx-get` links that swap the list region and `hx-push-url`; archive,
  publish/unpublish and delete are `hx-post`/`hx-delete` buttons that swap the card or remove it
  (`hx-swap="outerHTML"` / `delete` with an empty response); delete uses `hx-confirm`.
- Partials: `partials/quiz_card.html`, `partials/quiz_list.html`.

**Done when:** browse and my-quizzes match the Rust app's output for the same data, including
empty states and the 50-item cap.

### Phase 4 — Quiz editor (2–3 days) — the riskiest page
The Rust editor is ~600 lines of client-side JS. With HTMX it becomes a set of server-rendered
fragments:
- Details form → `hx-post`/`hx-put`, validation errors returned as the re-rendered form with
  per-field messages (same wording as today).
- Questions list as a fragment; "Add question" / "Edit" load the question form fragment into the
  page; "Save question" returns the refreshed list; reorder (↑/↓) posts the new order and swaps the
  list; archive, delete, share panel likewise.
- Typed vs multiple choice: switching kind swaps the options fragment (`hx-get` with the current
  form values via `hx-include`), keeping unsaved text. Add/remove option rows the same way.
- Validation and normalisation rules ported verbatim (≥2 choices + a marked answer for multiple
  choice, ≥1 accepted answer for typed, 5–600 s limits, length caps).

**Done when:** every editor action works without a full page reload and without hand-written JS,
and the validation messages match the Rust app.
**Fallback:** if reorder or option-row handling gets awkward in pure HTMX, allow ≤30 lines of
vanilla JS or Alpine-free `hx-on` handlers, not a framework.

### Phase 5 — Taking a quiz (2 days)
- Port `attempts.rs` and `grading.py`: snapshot questions on start, server-side clock
  (`served_at` stamped once), 2-second grace, shuffle, archived questions skipped, deleted
  questions recorded as skipped.
- **The answer key never leaves the server** until the question is answered.
- **HTMX flow:** `/quizzes/<id>/take` creates the attempt and redirects (POST, not GET);
  the runner page loads the current question as a fragment; answering swaps in the verdict
  fragment; "Next" swaps in the next question; "I've learned this" archives.
- **Timer:** the one place HTMX needs help. A small script (≈30 lines) drives the countdown and
  bar from `remainingMs` and, at zero, triggers the form's `hx-post` so the server records the
  timeout. The server remains the authority — the countdown is cosmetic.
- Results (`/results`, `/results/<id>`), delete-with-confirm modal via `hx-delete` and `<dialog>`.
- Port the unit tests for grading (case/space/quotes/full-stop rules, accents, grace period).

**Done when:** a full attempt grades identically to the Rust app, a late answer is marked
timed-out, and reloading mid-question does not reset the clock.

### Phase 6 — Friends, sharing, messages, admin (1–2 days)
- Friends: add by username, accept/decline/withdraw, unfriend — HTMX swaps of the lists.
- Shares: share quiz/question to friends (friends only; ids not belonging to friends are dropped),
  inbox page, copy-into-quiz picker, dismiss. Email through Resend over HTTP; failures are logged
  and never fail the share. Share-email links point to `/quizzes/<id>/take`.
- Message-me: one message per IP per UTC day, with the 429 "thanks for writing again" state and
  the contact address.
- Admin: the registration switch, saved with `hx-put`; admin-only route.
- About page, nav (hides the link to the current page), 404 → redirect to `/`.

**Done when:** every page in the Rust app has a Flask equivalent.

### Phase 7 — JSON API parity and tests (1–2 days)
- Re-expose `/api/*` with the same shapes (camelCase JSON) if Phase 0 decided to keep it.
- `pytest` suite against a throwaway database: auth/session flow, throttles, access rules (404 for
  private quizzes, 403 for non-friends), attempt timing, reorder permutation check, share
  idempotence, migrator checksum refusal.
- Contract check: run the same request script against the Rust app and the Flask app and diff
  responses.

**Done when:** the test suite is green and the contract diff is empty or every difference is
deliberate and listed.

### Phase 8 — Render deployment and cutover (1 day)
- `render.yaml`:
  ```yaml
  runtime: python
  buildCommand: pip install -r requirements.txt
  startCommand: gunicorn all_an.wsgi:app --workers 2 --threads 4 --bind 0.0.0.0:$PORT
  healthCheckPath: /healthz
  envVars: PYTHON_VERSION, DATABASE_URL (from the existing database), TRUST_PROXY_HEADERS=true,
           SESSION_COOKIE_SECURE=true, SITE_URL, plus the `sync: false` secrets
  ```
- Deploy to a **separate preview service** pointed at a **copy** of the production database first.
- Cutover: because the schema is shared and sessions/hashes are compatible, switching is a deploy
  of `main`, not a data migration. Keep the last Rust deploy available for rollback.
- Rewrite `README-all-an.md` and `docs/` for Python; delete Rust sources (`Cargo.*`, `src/`,
  `templates/` Askama files) and Rust-only docs.

**Done when:** production runs the Flask app on the existing database, users stay signed in, and
rollback to the Rust build has been rehearsed once.

## Risks and how to handle them

| Risk | Mitigation |
|---|---|
| Quiz editor is much more stateful than a typical HTMX page | Phase 4 is isolated and timeboxed; fallback to a few lines of vanilla JS is pre-approved. |
| Runner countdown needs client code | Keep it ≤30 lines; the server's clock decides correctness. |
| Password hashes drift between implementations | Test both directions (Rust↔Python) with real hashes before cutover. |
| Migrator rejects the live database | Phase 1's first check is an unmodified copy of production; checksums are SHA-256 of file text, byte-for-byte. |
| gunicorn workers run migrations concurrently | Advisory lock (already used today) plus running the migrator once before workers serve. |
| Wrong client IP behind Render collapses all throttles into one | Port the "last X-Forwarded-For entry" rule exactly; test with and without `TRUST_PROXY_HEADERS`. |
| HTML form POSTs open a CSRF hole the JSON-only API did not have | CSRF token on every mutating route, plus `SameSite=Lax`. |
| Cold start on Render free instances with two workers | Keep the pool small (max 10 across workers: size per worker accordingly). |

## Rough estimate

About **11–15 working days** end to end: Phases 0–2 (infrastructure and auth) ≈ 3–4 days,
Phases 3–6 (features) ≈ 7–9 days, Phases 7–8 (tests, deploy) ≈ 2–3 days. The editor (Phase 4) and
the runner (Phase 5) account for most of the uncertainty.

## Out of scope (until parity is reached)

New features, a schema change, switching ORM, an SPA frontend, and background workers. Revisit
after cutover.
