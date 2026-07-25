import { InjectionToken } from '@angular/core';

/**
 * What to prefix relative /api URLs with.
 *
 * Empty in the browser, where a relative URL already resolves against the page's own origin. On
 * the server it is filled in by app.config.server.ts, because there is no "current origin" during
 * rendering and `fetch('/api/quizzes')` has nothing to resolve against.
 *
 * It lives in its own file, and the server value is set in the server-only config, so that no
 * reference to `process` can leak into the browser bundle.
 */
export const API_ORIGIN = new InjectionToken<string>('API_ORIGIN', {
  providedIn: 'root',
  factory: () => ''
});
