# Prod build — how it is deployed

One Render web service running gunicorn. No Docker image, no registry, no cross-architecture
build: Render checks out the repository, installs the requirements, and starts the app.

```
pip install -r requirements.txt
        │
gunicorn all_an.wsgi:app          workers and threads from gunicorn.conf.py
```

Nothing is compiled or bundled. The templates and static files are read from the repository as they
are.

## What the app does at boot

`all_an/__init__.py`, in order, for each gunicorn worker:

1. **Open the database pool**, then **migrate**, then create the admin if the environment asks for
   one, then sweep dead sessions.
2. **Only then serve.** A request must never arrive against a half-migrated schema, and a deploy
   that cannot migrate should fail rather than serve. The worker exits, the health check never
   passes, and Render keeps the previous version serving.
3. Several workers start at once, so each tries the migration; a Postgres advisory lock makes the
   second a no-op. `/healthz` checks the database too.

Routes: `/healthz`, `/api/*`, `/static/*`, then the pages. An unmatched `/api` path is a JSON 404; an
unmatched page redirects to the front page.

## Deploying

The repository has a `render.yaml`, so:

1. **New → Blueprint** in Render, pointed at this repository.
2. It creates `all-an-database` and the `all-an` web service, wired together.
3. Fill in the variables marked `sync: false` when prompted.

Or by hand: **New → Web Service**, runtime **Python**, build `pip install -r requirements.txt`,
start `gunicorn all_an.wsgi:app`, health check `/healthz`, and set `PYTHON_VERSION`.

## Configuration

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Render injects it from the database |
| `PORT` | injected | Render sets it; gunicorn binds `0.0.0.0:$PORT` on its own |
| `PYTHON_VERSION` | yes | Pinned in `render.yaml` |
| `TRUST_PROXY_HEADERS` | yes | `true` behind Render's proxy |
| `SESSION_COOKIE_SECURE` | yes | `true` in production |
| `SITE_URL` | for email | Used for links inside share emails |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | optional | Creates the moderator at boot |
| `RESEND_API_KEY` / `MAIL_FROM` | optional | Sending share notifications |
| `WEB_CONCURRENCY` | optional | gunicorn workers (default 2) |
| `GUNICORN_THREADS` | optional | Threads per worker (default 4) |

### Two that are easy to get wrong

**`TRUST_PROXY_HEADERS=true` is required behind Render.** Without it every request appears to come
from the proxy: one IP for the entire internet, so the first person to send a contact message
exhausts the daily limit for everybody, and the login backoff locks out the world at once. With it
on, the client address is the last entry of `X-Forwarded-For` — the one the proxy itself appended.
It must be `false` anywhere the app is reachable directly, because the header can then be set by
anyone.

**`SESSION_COOKIE_SECURE=true` in production, `false` locally.** A `Secure` cookie is dropped over
plain http, so getting this backwards means nobody can stay signed in — in exactly one of the two
environments.

## Database

Render's *internal* connection string is a single-label hostname on their private network.
`all_an/db.py` recognises that, like `localhost`, and disables TLS, since there is no certificate to
verify and the network is already isolated. Anything else — including Render's external hostname —
gets TLS that is required but not certificate-verified, because the server presents a certificate
that does not chain to a public CA. Prefer the internal URL: it is the one that is actually
protected.

Each worker has its own pool of up to 5 connections, so the database sees
`workers × 5` — 10 by default. Stale connections (managed Postgres drops idle ones) are checked and
replaced before they are handed out.

**Cutting over from an earlier version needs nothing done to the data.** The same tables, the same
`schema_history` checksums, the same password hashes and session ids are used, so people stay signed
in and nothing is re-migrated.

## Email

Share notifications go through Resend's HTTP API — one request, no SMTP. HTTP rather than SMTP
because Render blocks outbound SMTP ports on free instances, so an SMTP client would simply time
out there.

With `RESEND_API_KEY` or `MAIL_FROM` unset, sending is skipped and logged. That is deliberate:
sharing is the user's action and the email is a courtesy on top of it, so a missing key — or a
provider having a bad afternoon — must not turn a successful share into an error. The share is in
the recipient's list either way.
