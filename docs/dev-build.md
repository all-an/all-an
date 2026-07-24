# Dev build — running the two services locally

In development the frontend and backend run as **separate processes** so Angular keeps hot reload.
Angular serves on `:4200`, Spring Boot on `:8080`, and Postgres runs in Docker.

```
ng serve :4200 ──/api proxy──▶ Spring Boot :8080 ──JDBC──▶ all-an-db (Docker) :5432
```

## 1. Start the database

Only the database comes from Compose here — not the app:

```bash
docker compose up -d db
```

That gives you `all-an-db` (Postgres 16) on `localhost:5432`, with database `all-an-db`, user
`allan`, password `allan`, and a named volume so data survives restarts.

Check it is ready before moving on:

```bash
docker ps --filter name=all-an-db     # want: Up (healthy)
```

## 2. Start Spring Boot

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

No environment variables needed — the defaults in `application.yml` already point at the local
Docker database:

```yaml
url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/all-an-db}
```

The `dev` profile activates `CorsConfig`, which allows `http://localhost:4200`. Flyway runs the
migrations on first boot; Hibernate is set to `ddl-auto: validate` and only checks the result.

Verify:

```bash
curl localhost:8080/api/cryptocurrencies    # -> [...]
```

## 3. Start Angular

```bash
cd frontend
npm install     # first time only
npm start       # = ng serve, on http://localhost:4200
```

Open <http://localhost:4200>. Edits to `src/app/*` reload instantly.

## How `/api` reaches Spring Boot

`CryptoService` calls the **relative** URL `/api/cryptocurrencies` — never a hardcoded
`http://localhost:8080`. That single detail is what lets the same code work in both modes.

In development that relative URL would hit the Angular dev server on `:4200`, so `proxy.conf.json`
forwards it:

```json
{
  "/api": {
    "target": "http://localhost:8080",
    "secure": false,
    "changeOrigin": true
  }
}
```

It is wired into `angular.json` under `serve.options.proxyConfig`, so plain `npm start` picks it up.
In production the bundle is served by Spring Boot itself, the origin is the same, and the relative
URL resolves with no proxy and no CORS.

## Everyday loop

```bash
docker compose up -d db                                  # once per session
mvn spring-boot:run -Dspring-boot.run.profiles=dev       # terminal 1
cd frontend && npm start                                 # terminal 2
```

## Serving the UI from :8080 locally (single-origin, like production)

If you open <http://localhost:8080> after only `mvn spring-boot:run`, you get this:

```
Whitelabel Error Page
This application has no explicit mapping for /error, so you are seeing this as a fallback.
There was an unexpected error (type=Not Found, status=404).
```

That is expected, and it is not a bug. The Angular bundle is copied into
`src/main/resources/static/` **by the Dockerfile**, during its build stages. A local
`mvn spring-boot:run` never runs those stages, so `static/` is empty, `SpaConfig` finds no
`index.html` to fall back to, and every non-`/api` URL 404s. (`/api/cryptocurrencies` still works — only
the UI is missing.)

Use the script to do locally what Docker does at build time:

```bash
./build-frontend-dist.sh
mvn spring-boot:run          # http://localhost:8080 now serves the Angular app
```

It runs `npm run build`, then copies `frontend/dist/frontend/browser/` into
`src/main/resources/static/`. After that, :8080 serves the UI and the API on one origin — no proxy,
no CORS — exactly like the deployed container.

**Restart Spring Boot after running it.** Resources are copied to the classpath at startup, so a
running app will not pick up the new files.

### Which mode should you use?

| | `ng serve` on :4200 | `build-frontend-dist.sh` + :8080 |
|---|---|---|
| Hot reload | yes | no — rebuild and restart each change |
| Origins | two (proxy handles `/api`) | one, like production |
| Good for | day-to-day frontend work | checking the real single-origin setup before building the image |

Reach for `ng serve` normally. Use the script when you want to verify what actually ships.

`src/main/resources/static/` is generated and gitignored — never commit it. To get back to a clean
tree, delete it: `rm -rf src/main/resources/static`.

## Stopping

```bash
docker compose stop db          # keeps data
docker compose down -v          # deletes the volume and all rows
```

## Troubleshooting

**"Could not reach the API" in the UI** — Spring Boot isn't up on `:8080`. The Angular error banner
says exactly this; check terminal 1.

**`Connection refused` on startup** — Postgres isn't ready. `docker ps` should show `(healthy)`.

**Port 5432 already in use** — a local Postgres is running. Stop it, or remap in
`docker-compose.yml` to `"5433:5432"` and set
`SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/all-an-db`.

**Table not created** — check the app logs for the Hibernate DDL; it runs at startup, not on first
request.
