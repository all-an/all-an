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
     * 127.0.0.1 rather than the site's public URL, so the request never leaves the box - no TLS
     * handshake, and no round trip out through Render's proxy just to come back in. This file is
     * only ever bundled into the server, which is what makes reading process.env here safe.
     */
    {
      provide: API_ORIGIN,
      useFactory: () => `http://127.0.0.1:${process.env['PORT'] ?? 8080}`
    }
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
