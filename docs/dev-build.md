# Dev build — running all-an locally

One process serves everything: Angular renders on the server, and the API lives in the same Express
app. There is no second service to start and no proxy to configure.

```
src/
├── app/      Angular — components, routes, services
├── api/      Express — the /api routes, server-only
├── main.ts        browser entry
├── main.server.ts SSR entry
└── server.ts      the Express app: /healthz, /api, static files, then Angular
```

## What you need

- **Node 22 or newer.** Angular 21 will not run on older versions.
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

The defaults point at the local database above. `.env` is gitignored. Every variable is documented
in `.env.example`; only `DATABASE_URL` is required.

## Run it

```bash
npm install
npm start
```

<http://localhost:4200> serves the UI, and `/api` the API — same port, same origin, no CORS.

`npm start` sets `PORT=4200` before starting the dev server. That is not decoration: during
server-side rendering the app calls its own API over loopback, and it has to know which port to
call. Start the dev server another way and SSR will try 8080 and quietly render every page
signed-out.

**Migrations run by themselves.** The API's first request applies anything pending, so a fresh
database is ready without a separate step. In production the same code runs before the server
starts listening instead.

## The production build, locally

```bash
npm run build
npm run serve:ssr
```

That is exactly what Render runs, on <http://localhost:8080>. Worth doing before a deploy: the
production build type-checks templates more strictly than the dev server does.

## Tests

```bash
npm test
```

Vitest, covering the places where a bug would be silent rather than loud — answer marking, password
hashing, the timeout rule, and the message daily limit.

## Adding a migration

Add `db/migration/V<n>__<name>.sql` and restart. The runner applies whatever `schema_history` has
not seen, each file in its own transaction, holding a Postgres advisory lock so two instances
deploying at once cannot both apply it.

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
| `db/migration/` | Schema, in order. Read at runtime, deliberately outside the bundle |
| `src/api/db/` | The pool and the migration runner |
| `src/api/http/` | Validation, the error mapper, the client-IP helper |
| `src/api/auth/` | Passwords, sessions, the throttles |
| `src/api/quizzes/` | Quizzes, questions, study fields |
| `src/api/attempts/` | Taking a quiz: timing and marking |
| `src/api/friends/`, `src/api/shares/` | Friends, and sharing quizzes and questions |
| `src/app/` | The Angular app |
