# all-an

TypeScript end to end: Angular 21 with server-side rendering, an Express API in the same process,
and Postgres. Deployed to Render as a plain Node service — no Docker anywhere in the deploy path.

Write timed quizzes on any subject, share them with friends, and see how you did.

```
                      one Node process
┌──────────────────────────────────────────────────────┐
│  Express                                             │
│    /healthz  →  /api/*  →  static  →  Angular SSR    │
└──────────────────────────────────────────────────────┘
                          │
                     Postgres
```

## Quick start

```bash
cp .env.example .env
npm install
npm start                       # http://localhost:4200
```

You need Node 22+ and a Postgres database called `all-an-database`. Migrations apply themselves on
the first request, so there is no separate setup step.

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

`docs/dev-build.md` has the rest — migrations, the production build, and where things live.

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

## Layout

```
db/migration/     schema, in order — read at runtime, not bundled
src/
├── app/          Angular: front page, auth, quizzes, runner, results, friends
├── api/          Express: auth, quizzes, attempts, friends, shares, messages
├── server.ts     the Express app — API mounted ahead of the renderer
├── main.ts       browser entry
└── main.server.ts SSR entry
render.yaml       the Render blueprint: web service + all-an-database
```

## Commands

| | |
|---|---|
| `npm start` | Dev server on `:4200`, API included |
| `npm run build` | Production build into `dist/all-an/` |
| `npm run serve:ssr` | Run that build, exactly as Render does |
| `npm test` | Vitest |

## Documentation

- [`docs/dev-build.md`](docs/dev-build.md) — running it locally, adding migrations
- [`docs/prod-build.md`](docs/prod-build.md) — what gets built, deploying, configuration
- [`docs/quizzes.md`](docs/quizzes.md) — the domain: visibility, timing, marking, sharing

## A few decisions worth knowing

**Nothing is prerendered.** The nav is on every page and depends on who is signed in, so a
prerendered page would ship the signed-out version and flip after hydration — on the front page,
the most common entry point. Rendering per request costs one indexed session lookup.

**The API is mounted inside the SSR server.** One process, one origin, no CORS. During rendering
the app calls its own API over loopback with the visitor's cookie forwarded, so a signed-in page is
correct on first paint.

**Passwords use `scrypt` from `node:crypto`.** Not bcrypt or argon2: both are native modules, and a
pure-stdlib hash keeps `npm ci` on Render free of a compile step — which is the point of a deploy
with no image to bake toolchains into.

**Sessions are opaque and stored hashed.** The cookie holds 32 random bytes; the database holds
their SHA-256. A leaked dump grants nobody a login, and deleting a row signs that browser out
immediately.

Rewritten from a Spring Boot + Angular application; the Java version is in the history, up to
commit `d082140`.
