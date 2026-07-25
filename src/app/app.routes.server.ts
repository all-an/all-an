import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * How each route is produced.
 *
 * Nothing is prerendered, deliberately. Prerendering happens at build time, when nobody is signed
 * in, and the nav in the shell is on every page - so a prerendered page always ships the
 * signed-out nav and flips to the signed-in one a moment after hydration. That flicker is on the
 * front page, the most common entry point, and getting the first paint right is the reason this
 * app renders on the server at all.
 *
 * Rendering per request costs an indexed session lookup per page, which at this size is nothing.
 *
 * Client is for pages where server rendering genuinely buys nothing: the two auth forms start
 * empty, and the quiz runner is a live countdown that begins when the browser starts it.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'register', renderMode: RenderMode.Client },

  { path: '**', renderMode: RenderMode.Server }
];
