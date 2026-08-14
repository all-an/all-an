import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, Observable, of, shareReplay, tap } from 'rxjs';

/** Mirrors the API's Settings. One boolean today; the shape is what makes room for more. */
export interface SiteSettings {
  registrationEnabled: boolean;
}

/**
 * What the UI assumes until the server says otherwise, and what it keeps assuming if the request
 * fails. Open, matching the server's own default: offering a form that comes back with a clean
 * "registration is closed" beats hiding it because one request blipped.
 */
const DEFAULT_SETTINGS: SiteSettings = {
  registrationEnabled: true
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/settings';

  private readonly current = signal<SiteSettings>(DEFAULT_SETTINGS);
  private request: Observable<SiteSettings> | undefined;

  readonly settings = computed(() => this.current());
  readonly registrationEnabled = computed(() => this.current().registrationEnabled);

  /**
   * Fetches the settings once per app instance, however many pages ask.
   *
   * Both auth pages want this, and the admin page wants it too - without the memo, moving between
   * sign in and register would re-ask for a value that cannot have changed in between. shareReplay
   * rather than a boolean guard so two subscribers during the same tick share one request.
   *
   * A failure resolves to the defaults rather than erroring: nothing on these pages depends on the
   * answer being right, only on it being reasonable, and the server enforces the real one.
   */
  load(): Observable<SiteSettings> {
    this.request ??= this.http.get<SiteSettings>(this.baseUrl).pipe(
      catchError(() => of(DEFAULT_SETTINGS)),
      tap((settings) => this.current.set(settings)),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    return this.request;
  }

  /**
   * Saves the whole set and adopts what came back.
   *
   * Errors are left to the caller, unlike load - a save that quietly failed would leave the admin
   * looking at a switch they believe they have thrown.
   */
  save(settings: SiteSettings): Observable<SiteSettings> {
    return this.http.put<SiteSettings>(this.baseUrl, settings).pipe(
      tap((saved) => {
        this.current.set(saved);
        // The memo now holds the pre-save answer. Replace it, so a page loading later in this
        // session is not told registration is open by a cached copy of the old value.
        this.request = of(saved);
      })
    );
  }
}
