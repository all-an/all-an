#!/usr/bin/env bash
#
# Builds the Angular bundle and copies it where Spring Boot can serve it.
#
# The Dockerfile does this inside its build stages, so a local `mvn spring-boot:run`
# has nothing under src/main/resources/static and every non-/api URL returns the
# Whitelabel 404. Run this once to serve the UI from :8080 locally, the same way
# production does.
#
#   ./build-frontend-dist.sh
#   mvn spring-boot:run          -> http://localhost:8080 serves the Angular app
#
# For day-to-day frontend work you usually want `ng serve` on :4200 instead
# (see docs/dev-build.md); this is for checking the production-style single-origin
# setup without building the image.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$ROOT/frontend/dist/frontend/browser"
STATIC="$ROOT/src/main/resources/static"

echo "==> Building Angular bundle"
cd "$ROOT/frontend"

if [ ! -d node_modules ]; then
  echo "    node_modules missing, running npm ci"
  npm ci
fi

npm run build

if [ ! -f "$DIST/index.html" ]; then
  echo "!!! Build finished but $DIST/index.html is missing." >&2
  echo "!!! Check angular.json outputPath if the Angular version changed." >&2
  exit 1
fi

echo "==> Copying dist into src/main/resources/static"
rm -rf "$STATIC"
mkdir -p "$STATIC"
cp -R "$DIST/." "$STATIC/"

echo "==> Done. $(find "$STATIC" -type f | wc -l | tr -d ' ') files copied:"
ls "$STATIC"
echo
echo "Now run:  mvn spring-boot:run     ->  http://localhost:8080"
echo "(restart Spring Boot if it is already running - resources are copied at startup)"
