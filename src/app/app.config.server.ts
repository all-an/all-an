import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { API_ORIGIN } from './auth/api-origin';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),

    /**
     * Where the renderer sends its own /api calls: back into this process over loopback.
     *
     * Loopback rather than the site's public URL, so the request never leaves the box - no TLS
     * handshake, and no round trip out through Render's proxy just to come back in. This file is
     * only ever bundled into the server, which is what makes reading process.env here safe.
     *
     * `localhost` and not the 127.0.0.1 literal. Which address family the listener ends up on is
     * not ours to predict: production binds dual-stack, but the dev server binds whatever
     * `localhost` resolves to on the host, and on Windows that is ::1 alone - against which an
     * IPv4 literal is refused, and every page then renders signed-out with a console full of
     * ECONNREFUSED. The name lets Node try both families and use whichever answers.
     */
    {
      provide: API_ORIGIN,
      useFactory: () => `http://localhost:${process.env['PORT'] ?? 8080}`
    }
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
