import { HttpErrorResponse } from '@angular/common/http';
import { Directive, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';

import { AuthService, AuthUser } from './auth.service.js';

/** Idle until submitted, then either sending or back to idle carrying an error. */
type Status = 'idle' | 'sending';

/**
 * What sign in and register have in common: two fields, one request, and the same three shapes of
 * failure. The two pages differ in their wording and in which service call they make, which is all
 * their subclasses supply.
 */
@Directive()
export abstract class CredentialsPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly username = signal('');
  protected readonly password = signal('');

  protected readonly status = signal<Status>('idle');

  /** Server-side field messages, keyed by field name, shown under the input they belong to. */
  protected readonly fieldErrors = signal<Record<string, string>>({});
  /** Anything that is not about one specific field: wrong credentials, taken username, throttled. */
  protected readonly formError = signal('');

  /**
   * The request this page makes. Takes no arguments so each page can send the fields it actually
   * has - registering needs an email address, signing in does not.
   */
  protected abstract submitRequest(): Observable<AuthUser>;

  protected submit(): void {
    if (this.status() === 'sending') {
      return;
    }

    this.status.set('sending');
    this.fieldErrors.set({});
    this.formError.set('');

    this.submitRequest().subscribe({
      next: () => this.onSuccess(),
      error: (error: HttpErrorResponse) => this.onError(error)
    });
  }

  /**
   * Back to wherever the guard interrupted, or the quizzes page.
   *
   * `next` is checked to be a path on this site before it is followed. A redirect target taken
   * from the query string and used unchecked is an open redirect: a link to
   * /login?next=https://elsewhere.example would send someone through this site's sign-in and out
   * to a page they would reasonably assume was still ours.
   */
  private onSuccess(): void {
    const next = this.route.snapshot.queryParamMap.get('next');
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/quizzes';

    void this.router.navigateByUrl(safe);
  }

  private onError(error: HttpErrorResponse): void {
    this.status.set('idle');

    if (error.status === 0) {
      this.formError.set('Could not reach the server. Check your connection and try again.');
      return;
    }

    if (error.status === 400 && error.error?.fields) {
      this.fieldErrors.set(error.error.fields as Record<string, string>);
      return;
    }

    this.formError.set(error.error?.message ?? 'Something went wrong. Please try again.');
  }
}
