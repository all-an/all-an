# Dev build — running all-an locally

One process serves everything: the pages are rendered by Rust on the server, and the API lives in
the same binary. There is no second service to start and no proxy to configure.

```
Cargo.toml
src/         Rust — startup, the /api routes, the pages, the domain modules
templates/   Askama page templates
static/      CSS and JavaScript the pages load, served under /static
db/migration SQL, compiled into the binary
```

## What you need

- **A recent stable Rust toolchain** — [rustup.rs](https://rustup.rs). The crate uses edition 2024.
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

## Configuration

```bash
cp .env.example .env
```

The defaults point at the local database above. `.env` is gitignored and loaded at startup. Every
variable is documented in `.env.example`; only `DATABASE_URL` is required.

## Run it

```bash
cargo run
```

<http://localhost:4200> serves the pages, and `/api` the API — same port, same origin, no CORS.

**Templates are compiled in, and `static/` is not.** Edit a CSS or JavaScript file and reload the
browser. Edit a template or Rust file and `cargo run` again. The server reads `static/` relative to
the directory it is started from, so run it from the repository root.

**Migrations run before the server listens.** A fresh database is ready without a separate step,
and a migration that fails stops the process rather than serving a half-built schema.

## The release build, locally

```bash
cargo build --release
./target/release/all-an
```

That is what Render runs. Worth doing before a deploy only if you changed dependencies; the dev
build checks the same things.

## Tests

```bash
cargo test
cargo clippy
```

Unit tests, covering the places where a bug would be silent rather than loud — answer marking,
password hashing (including a hash written by the old Node server), the timeout rule, and the
message daily limit. They need no database.

## Adding a migration

Add `db/migration/V<n>__<name>.sql` and rebuild — the files are embedded at compile time. On the next
start the runner applies whatever `schema_history` has not seen, each file in its own transaction,
holding a Postgres advisory lock so two instances deploying at once cannot both apply it.

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
| `db/migration/` | Schema, in order. Embedded in the binary |
| `src/db.rs` | The pool and the migration runner |
| `src/api.rs` | Every `/api` route and its request shapes |
| `src/pages.rs` | Every page, and the data each renders with |
| `src/auth.rs`, `src/password.rs`, `src/throttle.rs` | Sessions and extractors, scrypt, the limits |
| `src/quizzes.rs` | Quizzes, questions, study fields |
| `src/attempts.rs`, `src/grading.rs` | Taking a quiz: timing and marking |
| `src/friends.rs`, `src/shares.rs` | Friends, and sharing quizzes and questions |
| `templates/` | Askama templates; `base.html` is the layout |
| `static/js/` | One module per page; `api.js` is the shared client |
