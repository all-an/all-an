import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  inject
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { apiBaseInterceptor } from './auth/api-base.interceptor.js';
import { AuthService } from './auth/auth.service.js';
import { SettingsService } from './settings/settings.service.js';
import { routes } from './app.routes.js';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    /**
     * withFetch is not optional here. The default server backend is the `xhr2` shim, which
     * enforces the browser's forbidden-header list and so silently refuses to set Cookie - which
     * is exactly the header SSR has to forward to render a signed-in page. fetch on Node has no
     * such rule. It also drops the xhr2 dependency from the server bundle.
     */
    provideHttpClient(withFetch(), withInterceptors([apiBaseInterceptor])),
    provideClientHydration(withEventReplay()),

    /**
     * Resolve who is signed in before the first render, so the nav and the guards never flash the
     * signed-out state at somebody who is signed in. During SSR the cookie is forwarded, so the
     * answer is already correct in the HTML; the transfer cache then carries it to the browser
     * instead of the browser asking again.
     */
    provideAppInitializer(() => firstValueFrom(inject(AuthService).hydrate())),

    /**
     * And the site settings, for the same reason.
     *
     * The sign-in page offers a "create one" link only while registration is open. Left to the page
     * to fetch, that link renders on the default - open - and disappears when the answer arrives a
     * moment later, which is a visible flicker on the two pages that are client-rendered and so
     * have no server pass to settle it first.
     *
     * Initializers run concurrently, so this costs no more wall time than the hydrate above, and on
     * a server-rendered page the transfer cache means the browser does not repeat either request.
     */
    provideAppInitializer(() => firstValueFrom(inject(SettingsService).load()))
  ]
};
