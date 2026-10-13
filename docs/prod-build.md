# Prod build — how it is deployed

One Railway web service running gunicorn, with a Railway PostgreSQL database. No Docker image, no
registry, no cross-architecture build: Railway checks out the repository, installs the
requirements, and starts the app.

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
   passes, and Railway keeps the previous version serving.
3. Several workers start at once, so each tries the migration; a Postgres advisory lock makes the
   second a no-op. `/healthz` checks the database too.

Routes: `/healthz`, `/api/*`, `/static/*`, then the pages. An unmatched `/api` path is a JSON 404; an
unmatched page redirects to the front page.

## Deploying

The repository has a `railway.json` with the start command and health check, and a
`.python-version` that pins Python. The step-by-step guide is in
[`RAILWAY-DEPLOY.md`](../RAILWAY-DEPLOY.md): create the project from the GitHub repository, add a
PostgreSQL database, and set the variables below.

## Configuration

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | yes | `${{Postgres.DATABASE_URL}}`, a reference to the database service |
| `PORT` | injected | Railway sets it; gunicorn binds `0.0.0.0:$PORT` on its own |
| `TRUST_PROXY_HEADERS` | yes | `true` behind Railway's proxy |
| `SESSION_COOKIE_SECURE` | yes | `true` in production |
| `SITE_URL` | optional | The site's own address |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | optional | Creates the moderator at boot |
| `WEB_CONCURRENCY` | optional | gunicorn workers (default 2) |
| `GUNICORN_THREADS` | optional | Threads per worker (default 4) |

### Two that are easy to get wrong

**`TRUST_PROXY_HEADERS=true` is required behind Railway.** Without it every request appears to come
from the proxy: one IP for the entire internet, so the first person to send a contact message
exhausts the daily limit for everybody, and the login backoff locks out the world at once. With it
on, the client address is the last entry of `X-Forwarded-For` — the one the proxy itself appended.
It must be `false` anywhere the app is reachable directly, because the header can then be set by
anyone.

**`SESSION_COOKIE_SECURE=true` in production, `false` locally.** A `Secure` cookie is dropped over
plain http, so getting this backwards means nobody can stay signed in — in exactly one of the two
environments.

## Database

`all_an/db.py` treats `localhost` and single-label hostnames as private and disables TLS. Anything
else, including Railway's `*.railway.internal` and public hostnames, gets TLS that is required but
not certificate-verified, because managed Postgres commonly presents a certificate that does not
chain to a public CA. Prefer the internal URL: it stays on the project's private network.

Each worker has its own pool of up to 5 connections, so the database sees
`workers × 5` — 10 by default. Stale connections (managed Postgres drops idle ones) are checked and
replaced before they are handed out.

**Cutting over from an earlier version needs nothing done to the data.** The same tables, the same
`schema_history` checksums, the same password hashes and session ids are used, so people stay signed
in and nothing is re-migrated.
