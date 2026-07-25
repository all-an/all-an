import { HttpInterceptorFn } from '@angular/common/http';
import { inject, REQUEST } from '@angular/core';

import { API_ORIGIN } from './api-origin.js';

/**
 * Makes HttpClient work during server-side rendering.
 *
 * Two things are missing on the server that the browser supplies for free:
 *
 * 1. An origin. A relative '/api/quizzes' has nothing to resolve against, so it is prefixed with
 *    API_ORIGIN - loopback back into this same process. Loopback rather than the public URL keeps
 *    the call in-process: no TLS handshake, and no trip back out through Render's proxy only to
 *    arrive where it started.
 *
 * 2. The user's cookies. The renderer is a third party to the browser's session; without copying
 *    the incoming Cookie header onto the outgoing request, every SSR call is anonymous and a
 *    signed-in visitor gets a signed-out page on first paint, which then flips once the browser
 *    hydrates.
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const origin = inject(API_ORIGIN);

  // Empty origin means the browser, where neither adjustment applies.
  if (!origin || !req.url.startsWith('/')) {
    return next(req);
  }

  const incoming = inject(REQUEST, { optional: true });
  const cookie = incoming?.headers.get('cookie');

  return next(
    req.clone({
      url: `${origin}${req.url}`,
      // Only the cookie: forwarding the whole header set would carry the browser's
      // accept-encoding, host and content-length onto a request they no longer describe.
      setHeaders: cookie ? { cookie } : {}
    })
  );
};
