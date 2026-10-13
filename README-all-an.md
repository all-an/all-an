# all-an

Timed quizzes and a work timesheet, with a contact form. **Odin** server rendering HTML, **Postgres**
for messages, **Docker** to run it, **Render** to host it.

```
 browser ──HTTP──▶  Odin server (odin-http)  ──libpq──▶  Postgres
   │                  renders About, Message me, the app shell
   └─ localStorage:   quizzes, results, timesheet   (never leave the browser)
```

## How the data is split

| What | Where | Why |
|---|---|---|
| **Messages** (the contact form) | Postgres | They have to reach the owner, and the daily limit needs one shared source of truth. |
| **Quizzes, results, timesheet** | The visitor's browser, `localStorage` | Personal, no account needed, nothing to host. Export it as **CSV or JSON** from the *Data* page when you want a copy. |

The server renders the pages around the app (nav, About, Message me, the messages inbox). The
quizzes/timesheet screens are drawn in the browser from `static/app.js`, because `localStorage` only
exists there.

Because that data lives in one browser: clearing site data, or using another device, starts empty.
Export a JSON backup first, and import it back on the Data page.

## Run it locally, with the database in Docker

You need **Docker** (with Compose). Nothing else: the Odin compiler runs inside the build.

```bash
docker compose up --build
```

Open **http://localhost:10000**.

That starts two containers:

| Container | What | Reachable at |
|---|---|---|
| `all-an-db-odin` | Postgres 17 | `localhost:5432`, user `allan`, password `allan`, database `all-an-database` |
| `all-an-odin` | the app, built from the `Dockerfile` | `localhost:10000` |

The schema is created by the app on start (migrations are recorded in `schema_migrations`), so there
is no separate setup step.

Day to day:

```bash
docker compose up -d --build     # run in the background, rebuilding after code changes
docker compose logs -f app       # follow the app's log
docker compose down              # stop; messages stay in the volume
docker compose down -v           # stop and delete the database too
```

### Look inside the database

```bash
docker exec -it all-an-db-odin psql -U allan -d all-an-database
```

```sql
SELECT id, ip, sent_on, name, left(body, 40) FROM messages ORDER BY id DESC;
DELETE FROM messages WHERE ip = '172.18.0.1';   -- send another message from the same address
```

Or point DBeaver / TablePlus at `localhost:5432` with the credentials above.

### Read messages in the browser

`docker-compose.yml` sets `ADMIN_TOKEN`, so the inbox is at
**http://localhost:10000/admin/messages?token=local-dev-token-1234**.

### Only the database in Docker, the app on your machine

Handy when you are editing Odin code and want fast rebuilds.

```bash
docker compose up -d all-an-db-odin          # just Postgres
./scripts/fetch-deps.sh                       # clones odin-http into vendor/ (once)

# macOS: libpq is needed to link. `brew install libpq` first.
export DATABASE_URL=postgres://allan:allan@localhost:5432/all-an-database
export ADMIN_TOKEN=local-dev-token-1234
odin run src -collection:deps=vendor \
  -extra-linker-flags:"-L$(brew --prefix libpq)/lib"
```

On Linux install `libpq-dev` and drop the linker flag. You need Odin `dev-2026-07a` or newer
(`odin version`).

Type-check without linking or a database:

```bash
./scripts/fetch-deps.sh
odin check src -collection:deps=vendor -vet -strict-style
```

### Run the tests

```bash
docker build --target test .      # builds the toolchain image and runs `odin test`
```

### Checking the daily limit

1. Open http://localhost:10000/message and send a message → "Thank you!".
2. Send another → "Thanks for writing again!" (HTTP 429). The limit is one per address per **UTC
   calendar day**, enforced by a unique index on `(ip, sent_on)` in Postgres.
3. To try again right away: `DELETE FROM messages;` in `psql`.

Locally every request comes from the Docker bridge address, so all your browser tabs share one limit.

## Deploy to Render

1. Push the repo, then **New → Blueprint** and select it. `render.yaml` creates the Docker web
   service and a Postgres database named `all-an-db-odin`, and wires `DATABASE_URL` between them.
2. Optional: in the service's environment, set `ADMIN_TOKEN` to a long random value (16+ characters)
   to read messages at `/admin/messages?token=…`.

Render's free Postgres has limits (it is meant for trying things out). Check the current terms
on Render's pricing page before relying on it for anything you care about.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | *(required)* | Postgres connection string. |
| `PORT` | `10000` | Port to listen on (Render sets it). |
| `TRUSTED_PROXY_HOPS` | `1` on Render, else `0` | Proxies in front of the app. The sender's address is the `X-Forwarded-For` entry that many from the end; `0` ignores the header, so a forged one counts for nothing. If the daily limit hits everyone at once, or nobody, check this first. |
| `COOKIE_SECURE` | on Render | Send the CSRF cookie over HTTPS only. |
| `CONTACT_EMAIL` | `allan6tech@gmail.com` | Shown on the message pages. |
| `ADMIN_TOKEN` | *(unset)* | Enables `/admin/messages?token=…`. Must be 16+ characters. |

## Layout

```
src/
  main.odin     router, security headers, startup, graceful shutdown (SIGTERM)
  config.odin   environment
  pq.odin       libpq bindings (the few calls we use)
  db.odin       connection, migrations, the messages store
  web.odin      CSRF token, client address, form reading
  html.odin     HTML builder with escaping, page frame and nav
  pages.odin    About, Message me, the inbox, the app shell, errors
  text.odin     small string helpers
static/
  app.js        quizzes, results, timesheet, data (runs in the browser)
  app.css
Dockerfile      builds Odin + odin-http into a slim image
docker-compose.yml   app + Postgres for local use
render.yaml     Render Blueprint
scripts/fetch-deps.sh
```

## Notes

- **io_uring.** On Linux, odin-http (through Odin's `core:nbio`) runs on io_uring, and Docker's
  default seccomp profile blocks those syscalls: without help the server stops at startup with
  `runtime assertion: acquire_err == nil`. `docker-compose.yml` therefore sets
  `security_opt: seccomp=unconfined` for the app container. That is a local-development setting; it
  relaxes the container's syscall filter, so do not copy it into anything exposed.
  **Whether Render allows io_uring has not been verified.** If the Render service crashes on start
  with that same assertion, that is the cause, and the options are another host that permits it, or
  replacing the HTTP layer with one that uses epoll or blocking sockets.

- **odin-http is beta.** Its README says it is a proof of concept for what may enter Odin's core and
  that API compatibility is not promised. The `Dockerfile` pins both the Odin release and the
  odin-http commit, so builds are repeatable; bump them together and re-check.
- Every page escapes what visitors typed; the message form carries a CSRF token; responses set a
  strict Content-Security-Policy (no inline script, nothing from other sites).
- The server holds one Postgres connection behind a mutex. That is plenty for a contact form, and
  it is the first thing to replace if the database ever carries more.
