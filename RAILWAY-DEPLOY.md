# Deploying all-an on Railway

all-an is a Flask app served by gunicorn, with PostgreSQL. Railway detects Python from
`requirements.txt`, so the app needs no code changes and no Docker image. Migrations run by
themselves as the app starts.

This guide follows Railway's usual flow. Menu names move around, so if something differs, trust
Railway's own documentation over the labels here.

## What you need

- The repository on GitHub (`all-an/all-an`, branch `main`).
- A Railway account, signed in with GitHub.
- Your admin username, email and password (optional, but you will want an admin).

## 1. Create the project

1. In Railway: **New Project → Deploy from GitHub repo →** choose `all-an` and the `main` branch.
2. In the same project: **New → Database → Add PostgreSQL**.

You now have two services: the web service (your repo) and the Postgres database.

## 2. Start command and health check

In the web service, open **Settings** and set:

| Setting | Value |
|---|---|
| Custom Start Command | `gunicorn all_an.wsgi:app` |
| Healthcheck Path | `/healthz` |

`gunicorn.conf.py` already binds to the `PORT` that Railway injects and sets workers, threads and
timeouts, so nothing else is needed on the command line.

`/healthz` checks the database too, so a deploy that cannot reach Postgres is not marked healthy
and the previous deploy keeps serving.

## 3. Variables

In the web service, open **Variables** and add:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | A reference to the database service. Use that service's exact name if it is not `Postgres`. |
| `TRUST_PROXY_HEADERS` | `true` | Railway sits behind a proxy; the per-IP throttles need the real client address. |
| `SESSION_COOKIE_SECURE` | `true` | Required in production, or sign-in cookies are dropped over HTTPS. |
| `SITE_URL` | `https://<your-domain>` | The site's own address. |
| `ADMIN_USERNAME` | your choice | Creates the administrator at startup if that user does not exist. |
| `ADMIN_EMAIL` | your email | All three `ADMIN_*` are needed, or none. |
| `ADMIN_PASSWORD` | a strong password | Remove it from the variables once the account exists if you prefer. |
| `WEB_CONCURRENCY` | `2` | Optional. Gunicorn workers; each has its own pool of up to 5 connections. |
| `GUNICORN_THREADS` | `4` | Optional. Threads per worker. |

Do not set `RESEND_API_KEY` or `MAIL_FROM`. Email notifications were removed with the friends
feature, and nothing reads them.

## 4. Python version (recommended)

Render pins Python with `PYTHON_VERSION=3.13.5`. Railway picks its own default unless told
otherwise. To match what you have been running, add a file named `.python-version` at the
repository root containing:

```
3.13
```

Commit and push it. (This file is not in the repository yet.)

## 5. Domain

In the web service: **Settings → Networking → Generate Domain** for a
`*.up.railway.app` address, or add your own domain and create the DNS record Railway shows.
Update `SITE_URL` to match.

## 6. First deploy

Railway builds and deploys on every push to `main`. Watch the deploy log for:

- `pip install` finishing, then gunicorn starting.
- The migrator applying `V1` to `V10` on a fresh database.
- A passing health check.

Open the domain. `/login` should render, and you can sign in as the administrator you configured.

## Moving your data from Render

Do this before anyone uses the Railway site, and before the first visit if possible: the app
creates its tables on first start, and restoring over them needs a clean database.

```bash
# 1. Dump Render's database (use the External Database URL from the Render dashboard)
pg_dump --no-owner --no-acl "RENDER_EXTERNAL_DATABASE_URL" > all-an.sql

# 2. Restore into Railway's database (use its public connection URL from the Postgres service)
psql "RAILWAY_DATABASE_PUBLIC_URL" < all-an.sql
```

If the app has already started and created its tables, empty the Railway database first, or the
restore will fail on existing objects:

```bash
psql "RAILWAY_DATABASE_PUBLIC_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
```

Then restore, and redeploy so the app picks up the data. The `schema_history` table travels with
the dump, so migrations are recognised as already applied.

Sessions are stored in the database, so people stay signed in across the move.

## Cutover checklist

1. Railway site works: sign in, take a quiz, add a timesheet day.
2. Change DNS (or your links) to the Railway address.
3. Keep the Render service and database for a few days as a fallback, then delete them.
4. Remove the Render-only values (`RESEND_API_KEY`, `MAIL_FROM`) from anywhere you copied them.

## Operating notes

- **Logs**: the web service's **Deployments → View Logs**. gunicorn writes access and error logs
  to stdout.
- **Connections**: each worker holds up to 5 connections, so 2 workers use at most 10. If you
  raise `WEB_CONCURRENCY`, check the plan's connection limit.
- **Database trouble**: a pool timeout or database error is answered with a 503 and a "try again"
  message instead of a bare error, and the pool recycles connections every 15 minutes and detects
  dropped ones within about 20 seconds.
- **Backups**: take them yourself. A nightly `pg_dump` from a machine you control (or a Railway
  cron service) is cheap insurance.
- **Cost**: Railway bills by usage (CPU, memory, database storage) with a small monthly minimum.
  Check the Usage page after the first week.
- **Constants**: the daily minimum hours and on-site target live in `timesheet_constants`. Change
  them with SQL from Railway's database **Data** or **Connect** tab:

  ```sql
  UPDATE timesheet_constants SET value = '7.5' WHERE key = 'minimum_hours';
  ```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Deploy never becomes healthy | `DATABASE_URL` is missing or does not reference the database service. |
| Sign-in does nothing, or you are bounced back to login | `SESSION_COOKIE_SECURE` is `true` but you are on plain `http`, or it is unset behind HTTPS. |
| Everyone shares one rate limit | `TRUST_PROXY_HEADERS` is not `true`. |
| `PoolTimeout` or "service is busy" | The database is unreachable or at its connection limit; check the Postgres service's metrics and `/healthz`. |
| Wrong Python version in the build log | Add `.python-version` (step 4). |
| App says registration is closed | That is the site setting. The administrator can change it on `/admin`. |
