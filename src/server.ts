import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

import { createApiRouter, healthHandler, startup } from './api/index.js';

const browserDistFolder = join(import.meta.dirname, '../browser');

/**
 * Hostnames the renderer will answer for. Angular checks the Host header against this list to
 * block SSRF: a request carrying `Host: evil.example` would otherwise make the server render
 * absolute URLs pointing at somebody else's domain.
 *
 * Read from the environment rather than baked into angular.json, because the deployed hostname is
 * a deployment fact, not a build one - changing it should not mean rebuilding the bundle. An
 * unrecognised host does not fail loudly; Angular quietly falls back to client-side rendering,
 * which looks like "SSR mysteriously stopped working". Keep ALLOWED_HOSTS in step with the domain.
 */
const allowedHosts = (process.env['ALLOWED_HOSTS'] ?? 'localhost,127.0.0.1')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

/**
 * Render terminates TLS at its proxy and forwards the real host and scheme in X-Forwarded-*.
 * Without this the renderer sees the internal address instead, and every absolute URL it emits is
 * wrong. Only safe because the proxy sets those headers itself - an app exposed directly to the
 * internet with this on would let anyone spoof them, which is why it is off by default locally.
 */
const trustProxyHeaders = process.env['TRUST_PROXY_HEADERS'] === 'true';

const app = express();
const angularApp = new AngularNodeAppEngine({ allowedHosts, trustProxyHeaders });

/**
 * The same trust decision, for Express itself: req.ip must report the client address from
 * X-Forwarded-For rather than the proxy's, or the per-IP throttles would see one address for the
 * whole internet and lock everyone out together.
 */
if (trustProxyHeaders) {
  app.set('trust proxy', 1);
}

app.get('/healthz', healthHandler);

/**
 * The API, ahead of everything Angular. A request to /api never reaches the renderer, so there is
 * no need for the "if the path starts with api/, do not serve index.html" rule the Spring version
 * had to hand-roll.
 */
app.use('/api', createApiRouter());

/**
 * Serve static files from /browser.
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false
  })
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 8080;

  // Migrate before listening, never alongside: a request that arrives against a half-migrated
  // schema fails in ways that look like application bugs. Failing here instead means a bad deploy
  // never passes its health check and Render keeps the previous version serving.
  startup()
    .then(() => {
      app.listen(port, (error) => {
        if (error) {
          throw error;
        }

        console.log(`all-an listening on http://localhost:${port}`);
      });
    })
    .catch((error: unknown) => {
      console.error('Migrations failed; refusing to start.', error);
      process.exitCode = 1;
    });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build).
 */
export const reqHandler = createNodeRequestHandler(app);
