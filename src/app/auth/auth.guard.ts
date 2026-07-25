import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service.js';

/**
 * Keeps signed-out visitors off pages that need an account.
 *
 * The intended URL travels along as `next`, so signing in returns you to where you were headed
 * rather than dumping you on the front page - which, on a bookmarked link, reads as the site
 * losing the request.
 *
 * This is convenience, not security. Every route it protects is also enforced server-side; hiding
 * a page in the router does nothing about somebody calling the API directly.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isSignedIn()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};
