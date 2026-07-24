# all-an — build & run

Spring Boot 3.5 (Java 21) + Angular 21 + Postgres 16.

The Angular bundle is compiled into `src/main/resources/static/` and served by Spring Boot, so a
single jar ships both the UI and the API on one origin.

```
frontend/ ──ng build──▶ dist/frontend/browser/ ──copy──▶ src/main/resources/static/
                                                              │
                                                     mvn package
                                                              ▼
                                                    app.jar (UI + API)
```

## Prerequisites

| Tool | Version |
|---|---|
| JDK | 21 |
| Maven | 3.9+ (or the bundled wrapper) |
| Node | 24 |
| Docker | for Postgres, and for the production image |

## Quick start (development)

Two processes, so Angular keeps hot reload: Angular on `:4200`, Spring Boot on `:8080`.

```bash
docker compose up -d db                              # Postgres on :5432

mvn spring-boot:run -Dspring-boot.run.profiles=dev    # terminal 1

cd frontend && npm install && npm start               # terminal 2
```

Open <http://localhost:4200>.

No environment variables are needed — the defaults in `application.yml` already point at the
Compose database. The `dev` profile activates `CorsConfig`, which allows `http://localhost:4200`.

Wait for the database to report healthy before starting the app:

```bash
docker ps --filter name=all-an-db     # want: Up (healthy)
```

### How `/api` reaches Spring Boot

The Angular services call **relative** URLs (`/api/cryptocurrencies`), never a hardcoded host. In
development that would hit the dev server on `:4200`, so `frontend/proxy.conf.json` forwards `/api`
to `:8080`; it is wired into `angular.json` under `serve.options.proxyConfig`, so plain `npm start`
picks it up. In production the origin is the same and the relative URL resolves with no proxy and
no CORS.

## Serving the UI from :8080 locally

If you run only `mvn spring-boot:run` and open <http://localhost:8080>, you get a Whitelabel 404.
That is expected, not a bug: the bundle is copied into `src/main/resources/static/` **by the
Dockerfile**, during its build stages. A local `mvn spring-boot:run` never runs those stages, so
`static/` is empty, `SpaConfig` finds no `index.html` to fall back to, and every non-`/api` URL
404s. (`/api/cryptocurrencies` still works — only the UI is missing.)

Do locally what Docker does at build time:

```bash
./build-frontend-dist.sh
mvn spring-boot:run          # http://localhost:8080 now serves the Angular app
```

**Restart Spring Boot after running the script.** Resources are copied to the classpath at startup,
so a running app will not pick up the new files.

`src/main/resources/static/` is generated and gitignored — never commit it. To get back to a clean
tree: `rm -rf src/main/resources/static`.

| | `ng serve` on :4200 | `build-frontend-dist.sh` + :8080 |
|---|---|---|
| Hot reload | yes | no — rebuild and restart each change |
| Origins | two (proxy handles `/api`) | one, like production |
| Good for | day-to-day frontend work | verifying the real single-origin setup |

## Production build

`docker build .` runs three stages, split so each caches independently:

1. **`node:24-alpine`** — `npm ci`, then `npm run build` → `frontend/dist/frontend/browser/`
2. **`maven:3.9-eclipse-temurin-21`** — copies that dist into `src/main/resources/static/`, then
   `mvn package` seals the UI inside the jar
3. **`eclipse-temurin:21-jre-alpine`** — carries over only the jar, run as a non-root `spring` user

Build and run the whole stack:

```bash
docker compose build app     # or: docker build -t all-an-app:local .
docker compose up -d         # starts all-an-db + all-an-app
```

<http://localhost:8080> then serves the UI, and `/api/cryptocurrencies` the API — same port, same origin.

For Render, build for its architecture; an image built on an Apple Silicon Mac will not boot there:

```bash
docker buildx build --platform linux/amd64 -t <user>/all-an-app:latest --push .
```

## Database schema

Flyway owns the schema (`src/main/resources/db/migration/`, currently `V1`–`V7`) and migrations run
at startup. Hibernate is set to `ddl-auto: validate`, so drift between the entities and the
migrations fails the boot instead of silently altering tables. `baseline-on-migrate` is enabled so
existing databases that predate Flyway are marked at `V1` and get `V2+` applied on top.

To change the schema, add a new `V<n>__*.sql` — never edit an applied migration.

## Configuration

Every value has a default, so the image runs unmodified in all three environments.

| Variable | Default | Notes |
|---|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/all-an-db` | |
| `SPRING_DATASOURCE_USERNAME` | `allan` | |
| `SPRING_DATASOURCE_PASSWORD` | `allan` | |
| `PORT` | `8080` | Render injects this |

On Render, note that the connection string is shown as `postgres://user:pass@host/db`. JDBC will not
parse that — rewrite it to `jdbc:postgresql://host:port/db` and put the credentials in the two
separate variables.

## API

| Method | Path |
|---|---|
| `GET` | `/api/cryptocurrencies` |
| `GET` | `/api/cryptocurrencies/{symbol}` |
| `PUT` | `/api/cryptocurrencies/{symbol}/price` |

Actuator is on the classpath, so `/actuator/health` is available.

### How the SPA and the API coexist

`SpaConfig` maps `/**` to `classpath:/static/` with one custom rule:

- the path is a real file → serve it (`main-<hash>.js`, `styles-<hash>.css`, …)
- the path starts with `api/` → return `null` so the controllers handle it
- anything else → return `index.html`

The third rule is what makes deep links work: Angular's router owns routes like `/crypto`, but on
a hard refresh the browser asks the *server* for that path. The `api/` check must come first, or the
API would return HTML.

## Tests

```bash
mvn test                       # backend, H2 in-memory
cd frontend && npm test        # frontend
```

## Stopping

```bash
docker compose stop db          # keeps data
docker compose down -v          # deletes the volume and all rows
```

## Troubleshooting

**"Could not reach the API" in the UI** — Spring Boot isn't up on `:8080`.

**Whitelabel 404 at :8080** — the Angular bundle was never copied in. Run `./build-frontend-dist.sh`
and restart.

**`Connection refused` on startup** — Postgres isn't ready; `docker ps` should show `(healthy)`.

**Port 5432 already in use** — a local Postgres is running. Stop it, or remap in
`docker-compose.yml` to `"5433:5432"` and set
`SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/all-an-db`.

**Schema validation failure on boot** — an entity and the migrations disagree. Add a migration to
match the entity rather than relaxing `ddl-auto`.

---

More detail: [docs/dev-build.md](docs/dev-build.md) · [docs/prod-build.md](docs/prod-build.md)
