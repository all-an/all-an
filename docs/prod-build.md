# Prod build — how it is built and deployed

One Render web service running a single Rust binary. No Docker image, no registry, no
cross-architecture build: Render checks out the repository, compiles it, and starts the result.

```
cargo build --release
        │
        └── target/release/all-an     pages + API + migrations in one process
                │
        ./target/release/all-an       run from the repository root, next to static/
```

## What the build produces

One executable. Askama compiles the templates into it and `include_dir` embeds `db/migration/`, so
the only thing it reads from disk at runtime is **`static/`** — the CSS and JavaScript — relative to
the working directory. Render starts the service from the repository root, which is where that
directory is.

Server code — SQL, password hashing, session lookups — is not in anything the browser downloads:
the browser gets HTML and the files under `static/`, and nothing else exists to leak.

## What the server does at boot

`src/main.rs`, in order:

1. **Migrate**, then create the admin if the environment asks for one, then sweep dead sessions.
2. **Only then listen.** A request must never arrive against a half-migrated schema, and a deploy
   that cannot migrate should fail rather than serve. It exits non-zero instead, the health check
   never passes, and Render keeps the previous version serving.
3. Routes: `/healthz`, `/api/*`, `/static/*`, then the pages. An unmatched `/api` path is a JSON 404;
   an unmatched page redirects to the front page.

## Deploying

The repository has a `render.yaml`, so:

1. **New → Blueprint** in Render, pointed at this repository.
2. It creates `all-an-database` and the `all-an` web service, wired together.
3. Fill in the variables marked `sync: false` when prompted.

Or by hand: **New → Web Service**, runtime **Rust**, build `cargo build --release`, start
`./target/release/all-an`, health check `/healthz`. The first build compiles every dependency and
takes several minutes; later builds reuse Render's cache.

## Configuration

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Render injects it from the database |
| `PORT` | injected | Render sets it; the server falls back to 8080 |
| `TRUST_PROXY_HEADERS` | yes | `true` behind Render's proxy |
| `SESSION_COOKIE_SECURE` | yes | `true` in production |
| `SITE_URL` | for email | Used for links inside share emails |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | optional | Creates the moderator at boot |
| `RESEND_API_KEY` / `MAIL_FROM` | optional | Sending share notifications |
| `RUST_LOG` | optional | Log filter, e.g. `debug`; defaults to `info` |

`ALLOWED_HOSTS` is gone: it existed because Angular's renderer needed a host allow-list. Nothing
here builds absolute URLs from the `Host` header, so there is nothing to allow-list.

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
`src/db.rs` recognises that, like `localhost`, and disables TLS, since there is no certificate to
verify and the network is already isolated. Anything else — including Render's external hostname —
gets TLS that is required but not certificate-verified, because the server presents a certificate
that does not chain to a public CA. Prefer the internal URL: it is the one that is actually
protected.

An existing database from the Node version needs nothing: the same `schema_history` table and
checksums are used, and existing password hashes keep verifying.

## Email

Share notifications go through Resend's HTTP API — one request, no SMTP. HTTP rather than SMTP
because Render blocks outbound SMTP ports on free instances, so an SMTP client would simply time
out there.

With `RESEND_API_KEY` or `MAIL_FROM` unset, sending is skipped and logged. That is deliberate:
sharing is the user's action and the email is a courtesy on top of it, so a missing key — or a
provider having a bad afternoon — must not turn a successful share into an error. The share is in
the recipient's list either way.
