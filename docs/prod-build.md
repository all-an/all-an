# Prod build — how the dist is created and served

In production there is **one container**. Angular is compiled to a static bundle, that bundle is
baked into the Spring Boot jar, and Spring Boot serves both the API and the UI from a single origin.

```
frontend/ ──ng build──▶ dist/frontend/browser/ ──copy──▶ src/main/resources/static/
                                                              │
                                                     mvn package
                                                              ▼
                                                    app.jar (UI + API)
```

## The three Docker stages

`docker build .` runs `Dockerfile`, which is deliberately split so each stage caches independently.

### Stage 1 — build the dist (`node:24-alpine`)

```dockerfile
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
```

`package.json` is copied **before** the source so `npm ci` re-runs only when dependencies change,
not on every source edit.

`npm run build` produces:

```
frontend/dist/frontend/browser/
├── index.html
├── main-<hash>.js
├── styles-<hash>.css
└── favicon.ico
```

The `browser/` subfolder is Angular's application-builder layout — the path that matters in the next
stage. `outputPath` isn't set in `angular.json`, so this is the default derived from the project
name (`frontend`).

### Stage 2 — bake it into the jar (`maven:3.9-eclipse-temurin-21`)

```dockerfile
COPY pom.xml ./
RUN mvn -B dependency:go-offline
COPY src ./src
COPY --from=frontend /frontend/dist/frontend/browser/ ./src/main/resources/static/
RUN mvn -B clean package -DskipTests
```

The key line is the `COPY --from=frontend`: **Angular's dist becomes Spring Boot's static content.**
Anything under `src/main/resources/static/` lands on the classpath, so `mvn package` seals the whole
UI inside `app.jar`.

That directory is generated, never committed — it's in `.gitignore`.

### Stage 3 — runtime (`eclipse-temurin:21-jre-alpine`)

Only the jar is carried over. The final image has no Node, no Maven, no source — a JRE and one file,
run as a non-root `spring` user.

## How Spring Boot serves the bundle

`SpaConfig` maps `/**` to `classpath:/static/` with one custom rule:

- the path is a real file → serve it (`main-<hash>.js`, `styles.css`, …)
- the path starts with `api/` → return `null` so `GreetingController` handles it
- anything else → return `index.html`

The third rule is what makes deep links work. Angular's router owns routes like `/greetings`, but on
a hard refresh the browser asks the *server* for that path. Without the fallback it would be a 404;
with it, `index.html` loads and Angular routes on the client.

Ordering matters: the `api/` check must come before the fallback, or the API would return HTML.

## Build and run it locally

```bash
docker compose build app     # or: docker build -t all-an-app:local .
docker compose up -d         # starts all-an-db + all-an-app
```

Then <http://localhost:8080> serves the UI, and `/api/greetings` the API — same port, same origin,
no CORS and no proxy.

## Push to Docker Hub

```bash
docker login
docker build -t <user>/all-an-app:latest .
docker push <user>/all-an-app:latest
```

For Render, build for its architecture — an image built on an Apple Silicon Mac will not boot there:

```bash
docker buildx build --platform linux/amd64 -t <user>/all-an-app:latest --push .
```

## Deploy on Render

1. **New Web Service** → *Deploy an existing image* → `docker.io/<user>/all-an-app:latest`
2. Create a Render Postgres instance.
3. Set on the web service:

| Variable | Value |
|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<host>:<port>/<db>` |
| `SPRING_DATASOURCE_USERNAME` | from Render |
| `SPRING_DATASOURCE_PASSWORD` | from Render |

`PORT` is injected by Render automatically and `application.yml` already reads it
(`server.port: ${PORT:8080}`), so it needs no entry.

**The one thing that trips people up:** Render shows the connection string as
`postgres://user:pass@host/db`. JDBC will not parse that. Rewrite it to
`jdbc:postgresql://host:port/db` and put the credentials in the two separate variables.

## Configuration summary

| Variable | Default | Used for |
|---|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/all-an-db` | Local dev points at Docker Postgres |
| `SPRING_DATASOURCE_USERNAME` | `allan` | |
| `SPRING_DATASOURCE_PASSWORD` | `allan` | |
| `PORT` | `8080` | Render overrides this |

Because every value has a default, the image runs unmodified in all three environments.
