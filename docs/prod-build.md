# Prod build — how it is built and deployed

One Render **Node** web service. No Docker image, no registry, no cross-architecture build: Render
checks out the repository, runs the build, and starts the compiled server.

```
npm ci && npm run build
        │
        ├── dist/all-an/browser/   the client bundle, hashed
        └── dist/all-an/server/    server.mjs — SSR + the API in one process
                │
        node dist/all-an/server/server.mjs
```

## What `ng build` produces

The Angular application builder compiles two graphs from one source tree:

- **`browser/`** — what the visitor downloads. Reached from `src/main.ts`.
- **`server/server.mjs`** — the Express app. Reached from `src/server.ts`, which pulls in
  `src/api/**` and so bundles the whole API alongside the renderer.

Nothing under `src/api/` is reachable from `src/main.ts`, and that is what keeps server code — SQL,
password hashing, session lookups — out of the browser bundle. The separation is maintained by
imports alone, so it is worth keeping in mind: an Angular component importing from `src/api/` would
drag it across.

`pg` is listed in `externalDependencies` in `angular.json`. esbuild leaves it alone rather than
trying to bundle a driver with optional native pieces, and Render's `node_modules` supplies it at
runtime.

## What the server does at boot

`src/server.ts`, in order:

1. **Migrate**, then create the admin if the environment asks for one, then sweep dead sessions.
2. **Only then listen.** A request must never arrive against a half-migrated schema, and a deploy
   that cannot migrate should fail rather than serve. It exits non-zero instead, the health check
   never passes, and Render keeps the previous version serving.
3. `/healthz` → `/api/*` → static files → the Angular renderer, in that order. The API is mounted
   ahead of the renderer, which is why no "if the path starts with `api/`, don't serve index.html"
   rule is needed anywhere — the hand-rolled `SpaConfig` of the Spring version is simply gone.

`db/migration/*.sql` is read from disk at runtime and is deliberately **not** part of the bundle or
the static assets — those files are served to nobody.

## Deploying

The repository has a `render.yaml`, so:

1. **New → Blueprint** in Render, pointed at this repository.
2. It creates `all-an-database` and the `all-an` web service, wired together.
3. Fill in the variables marked `sync: false` when prompted.

Or by hand: **New → Web Service**, runtime **Node**, build `npm ci && npm run build`, start
`node dist/all-an/server/server.mjs`, health check `/healthz`.

## Configuration

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Render injects it from the database. `pg` takes it as-is |
| `PORT` | injected | Render sets it; `server.ts` falls back to 8080 |
| `ALLOWED_HOSTS` | yes | Hostnames the renderer will answer for |
| `TRUST_PROXY_HEADERS` | yes | `true` behind Render's proxy |
| `SESSION_COOKIE_SECURE` | yes | `true` in production |
| `SITE_URL` | for email | Used for links inside share emails |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | optional | Creates the moderator at boot |
| `RESEND_API_KEY` / `MAIL_FROM` | optional | Sending share notifications |

### Three that are easy to get wrong

**`ALLOWED_HOSTS` must include the real hostname.** Angular checks the `Host` header to prevent
SSRF. An unrecognised host does not throw — it silently falls back to client-side rendering. The
symptom is "SSR mysteriously stopped working" after a domain change, with nothing in the log to say
why.

**`TRUST_PROXY_HEADERS=true` is required behind Render.** Without it every request appears to come
from the proxy: one IP for the entire internet, so the first person to send a contact message
exhausts the daily limit for everybody, and the login backoff locks out the world at once. It must
be `false` anywhere the app is reachable directly, because the header can then be set by anyone.

**`SESSION_COOKIE_SECURE=true` in production, `false` locally.** A `Secure` cookie is dropped over
plain http, so getting this backwards means nobody can stay signed in — in exactly one of the two
environments.

## Database

Render's *internal* connection string is a single-label hostname on their private network.
`pool.ts` recognises that and disables TLS, since there is no certificate to verify and the network
is already isolated. Anything else — including Render's external hostname — gets TLS with
`rejectUnauthorized: false`, because the server presents a self-signed certificate. Prefer the
internal URL: it is the one that is actually protected.

Unlike the Spring version, there is nothing to rewrite. Render's `postgres://user:pass@host/db` is
exactly what `pg` expects; the `jdbc:postgresql://` translation step, and the three separate
`SPRING_DATASOURCE_*` variables, went with the JVM.

## Email

Share notifications go through Resend's HTTP API — one `fetch`, no dependency. HTTP rather than
SMTP because Render blocks outbound SMTP ports on free instances, so a nodemailer setup would
simply time out there.

With `RESEND_API_KEY` or `MAIL_FROM` unset, sending is skipped and logged. That is deliberate:
sharing is the user's action and the email is a courtesy on top of it, so a missing key — or a
provider having a bad afternoon — must not turn a successful share into an error. The share is in
the recipient's list either way.
