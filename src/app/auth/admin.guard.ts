import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service.js';

/**
 * Keeps everyone but an administrator off the admin page.
 *
 * A signed-out visitor goes to sign in carrying `next`, as authGuard does - they may well be the
 * administrator, just not yet. A signed-in one who is not an administrator goes home instead:
 * offering them a sign-in form implies a different account would help, and none would.
 *
 * Convenience, not security. Every setting behind this is enforced again by requireAdmin on the
 * API, because hiding a page in the router does nothing about somebody calling PUT /api/settings.
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin()) {
    return true;
  }

  return auth.isSignedIn()
    ? router.createUrlTree(['/'])
    : router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};
