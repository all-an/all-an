# all-an

Rust on the server, plain JavaScript in the browser, Postgres underneath. One binary serves the
pages and the API; no Node anywhere, and no Docker in the deploy path.

Write timed quizzes on any subject, share them with friends, and see how you did.

```
                       one Rust binary (axum)
┌──────────────────────────────────────────────────────────┐
│  /healthz   /api/*   /static/*   pages (Askama templates) │
└──────────────────────────────────────────────────────────┘
                           │
                      Postgres (sqlx)
```

Every page is rendered on the server, so the first response already has the right nav and the
right data. JavaScript (`static/js`, ES modules, no build step) only adds behaviour: forms,
buttons, the quiz clock, the editor.

## Quick start

```bash
cp .env.example .env
cargo run                       # http://localhost:4200
```

You need a recent stable Rust toolchain ([rustup.rs](https://rustup.rs)) and a Postgres database
called `all-an-database`. Migrations apply themselves at startup, before the server listens, so
there is no separate setup step.

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

`docs/dev-build.md` has the rest — migrations, the release build, and where things live.

## What it does

**Quizzes.** A quiz is filed under a curated *study field* (Languages, Mathematics, History &
geography, …) and a free-text *subject* of your choosing. Its questions are multiple choice or
type-the-answer, each with its own time limit.

**Taking one.** Questions arrive one at a time against a countdown. Marking and timing are decided
by the server — the answer key never reaches the browser before you have answered, and running out
of time scores the question wrong even if what you typed was right. Typed answers ignore case,
stray spaces and a trailing full stop, because someone who writes `Bought.` knows the answer.

**Sharing.** Publish a quiz to the shared pool, or send it to a friend. Friend requests have to be
accepted before anything can be sent. A shared quiz is one your friend can take; a shared *question*
is one they can copy into a quiz of their own. Both notify by email when mail is configured.

**Results.** Every attempt is kept, with your answer, the right answer and how long you took.

**Site settings.** An administrator gets an `/admin` page holding switches that take effect without
a deploy. There is one so far: closing registration, which stops new accounts while leaving every
existing one able to sign in.

## Layout

```
Cargo.toml
db/migration/     schema, in order — compiled into the binary
templates/        Askama page templates (base layout + one per page)
static/
├── css/          one stylesheet per page, plus the shared look in page.css
└── js/           one module per page; api.js is the shared client
src/
├── main.rs       startup: config, pool, migrations, router, listener
├── api.rs        every /api route
├── pages.rs      every HTML page and the data it renders with
├── auth.rs       sessions, request extractors, client IP
├── password.rs   scrypt hashing
├── quizzes.rs  attempts.rs  friends.rs  shares.rs  messages.rs  settings.rs  users.rs
├── grading.rs    how typed and multiple-choice answers are marked (pure, tested)
├── throttle.rs   signup and login-failure limits
├── db.rs         connection pool and the migrator
├── mail.rs       Resend client
└── error.rs  validate.rs  config.rs  state.rs
render.yaml       the Render blueprint: web service + all-an-database
```

## Commands

| | |
|---|---|
| `cargo run` | Run on `:4200` (from `.env`), API and pages included |
| `cargo build --release` | Optimised binary at `target/release/all-an` |
| `cargo test` | Unit tests |
| `cargo clippy` | Lints |

## Documentation

- [`docs/dev-build.md`](docs/dev-build.md) — running it locally, adding migrations
- [`docs/prod-build.md`](docs/prod-build.md) — what gets built, deploying, configuration
- [`docs/quizzes.md`](docs/quizzes.md) — the domain: visibility, timing, marking, sharing

## A few decisions worth knowing

**Pages are rendered per request, never prerendered.** The nav is on every page and depends on who
is signed in, so a prerendered page would ship the signed-out version and flip afterwards — on the
front page, the most common entry point. Rendering per request costs one indexed session lookup.

**Pages and API share one process and one origin.** No CORS, and the page handlers call the same
service functions the API does rather than making HTTP calls to themselves.

**Checked at compile time.** Askama compiles templates into the binary, so a template that
references a field that does not exist fails the build rather than the page.

**Passwords use `scrypt`.** Stored as `scrypt$N$r$p$salt$hash`, a format that predates the Rust
rewrite: accounts created by the Node version sign in unchanged, and a regression test verifies a
hash written by Node's `crypto.scrypt`. The cost parameters are read back out of the stored string,
and refused above a ceiling, so raising the cost later never locks anyone out and a forged hash
cannot ask for gigabytes.

**Sessions are opaque and stored hashed.** The cookie holds 32 random bytes; the database holds
their SHA-256. A leaked dump grants nobody a login, and deleting a row signs that browser out
immediately.

**Migrations are the existing Flyway-style files.** `db/migration/V<n>__name.sql`, applied in order
inside transactions under a Postgres advisory lock, recorded in `schema_history` with a SHA-256
checksum. An applied migration that has since changed refuses to start. The table and checksum
scheme are the ones the Node version used, so an existing database is picked up as it is.

Rewritten from Spring Boot + Angular, then Angular SSR + Express, then Rust; the earlier versions
are in the history.
