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

Both come from `railway.json` in the repository, so there is nothing to type. In the web
service's **Settings** you should see:

| Setting | Value |
|---|---|
| Custom Start Command | `gunicorn all_an.wsgi:app` |
| Healthcheck Path | `/healthz` |

If they are empty, enter them by hand.

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

The repository has a `.python-version` file at its root containing `3.13`, so builds use that
Python line. Change it there if you want another version.

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

## Moving data from an existing database

Do this before anyone uses the Railway site, and before the first visit if possible: the app
creates its tables on first start, and restoring over them needs a clean database.

```bash
# 1. Dump the old database (use its external connection URL)
pg_dump --no-owner --no-acl "OLD_DATABASE_URL" > all-an.sql

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

## Connecting a database client (DBeaver, psql, ...)

You can browse and query the Railway database from your own machine. The app itself uses the
private address inside the project; a client on your laptop needs the **public** one.

### With DBeaver

1. In Railway, open the **PostgreSQL service** and look under **Variables** or **Connect**.
2. Take the **public** connection details. Railway names the URL `DATABASE_PUBLIC_URL`; its host
   looks like `*.proxy.rlwy.net` and it uses a custom port. The internal
   `postgres.railway.internal` host only works inside the project.
3. In DBeaver: **New Database Connection → PostgreSQL**, then either:
   - paste the `DATABASE_PUBLIC_URL`, or
   - fill in **Host**, **Port**, **Database** (usually `railway`), **Username** and **Password**
     from the same page.
4. On the **SSL** tab, enable SSL with mode `require` (do not verify the certificate; Railway's
   is not signed by a public CA).
5. **Test Connection**, then save.

### Things to know

- **TCP proxy**: the public endpoint is Railway's TCP proxy. If the Connect tab shows no public
  URL, enable it in the Postgres service's **Settings → Networking** (a TCP proxy for port 5432).
- **Traffic costs money**: data leaving Railway to your machine counts as network usage. A few
  queries are nothing, but avoid big exports and constant refreshing of large tables.
- **It is production**: you are connected to the live database. Prefer a read-only role for
  everyday browsing, and run any `UPDATE` or `DELETE` deliberately (the timesheet constants
  change is one such statement).
- **Keep the URL secret**: it contains the database password and is reachable from the internet.
  Keep it out of the repository, screenshots and chat. If it leaks, rotate the password from the
  Postgres service's settings and update `DATABASE_URL` references.
- **Connection limit**: your client uses a connection too, on top of the app's 10. Close idle
  DBeaver connections (or lower its pool) if you run close to the plan's limit.
- **If it will not connect**: the usual causes are SSL set to `disable`, using the internal host
  instead of the public one, or the TCP proxy not being enabled.

### Alternative: the Railway CLI (no public port needed)

The CLI reaches the database through your Railway login, so you do not need to expose the TCP
proxy or handle the password.

**Install the CLI** (pick one):

```bash
# macOS (Homebrew)
brew install railway

# Any OS with Node.js
npm install -g @railway/cli

# macOS / Linux / WSL (install script)
bash <(curl -fsSL cli.new)
```

On Windows without Node, use Scoop (`scoop install railway`) or download the binary from the
Railway CLI releases page. Check it worked with `railway --version`.

**Sign in and link the project** (once, from the repository folder):

```bash
railway login          # opens the browser to authenticate
railway link           # choose the workspace, project and environment
```

**Open a SQL shell** to the database:

```bash
railway connect Postgres     # use your database service's exact name
```

This starts `psql` against the database, so `psql` must be installed locally
(`brew install libpq`, or your OS package `postgresql-client`). From the prompt you can run
queries directly, for example:

```sql
SELECT key, value FROM timesheet_constants;
```

Other handy commands:

```bash
railway logs                       # stream the web service's logs
railway variables                  # list the environment's variables
railway run <command>              # run a command with the project's variables loaded
```

The CLI gives a shell, not a port, so DBeaver still uses the public URL above. Use the CLI for
quick checks and one-off statements, and DBeaver when you want to browse tables.

## Cost control (do this on day one)

Railway bills by usage (CPU, memory, network and database storage), so a runaway process, a
request loop or a bot hammering the site costs more instead of just being slow. Set the guardrails
before anything else, so there are no surprises on the invoice.

1. **Usage limit / hard limit**: in the Railway dashboard open the **account or workspace
   Settings → Usage** (also called Billing) and set a **hard limit**: a spend ceiling at which
   services are stopped rather than billed further. Pick a number you would be comfortable losing
   a month's uptime over, for example a small multiple of your expected bill.
2. **Usage alert**: set a lower **alert threshold** (for example half the hard limit) so you get
   an email before the limit is reached.
3. **Right-size the app**: keep `WEB_CONCURRENCY=2` and `GUNICORN_THREADS=4`. More workers cost
   more memory, and this app does not need them at small scale.
4. **Look after the first week**: open **Usage** after a few days and compare it with what you
   expected. A flat, boring graph is the goal.
5. **Check the database too**: storage and backups are billed separately from the web service.

If an alert fires: look at the web service's logs and metrics first (an error loop or unusual
traffic), then the database's size. Pausing the service from its settings stops the meter
immediately.

Menu names change from time to time, so look for "Usage", "Billing" or "Spend limit" in your
account settings if the labels differ.

## Cutover checklist

1. Railway site works: sign in, take a quiz, add a timesheet day.
2. Change DNS (or your links) to the Railway address.
3. Keep the old service and database for a few days as a fallback, then delete them.
4. Do not carry over `RESEND_API_KEY` or `MAIL_FROM`; nothing reads them.
5. Cost control is set: a hard usage limit and an alert threshold (see above).

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
  Configure the spend limit and alert described in "Cost control" above, and check the Usage page
  after the first week.
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
