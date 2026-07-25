import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

export interface Credentials {
  username: string;
  password: string;
}

/** Registering also needs an address: sharing a quiz with a friend emails them. */
export interface Registration extends Credentials {
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/auth';

  private readonly current = signal<AuthUser | null>(null);

  /** Who is signed in, or null. Read by the nav, the guard and every page that cares. */
  readonly user = computed(() => this.current());
  readonly isSignedIn = computed(() => this.current() !== null);
  readonly isAdmin = computed(() => this.current()?.role === 'ADMIN');

  /**
   * Asks the server who this is. Called once at startup, on the server and again in the browser -
   * though the transfer cache means the browser normally reuses the render's answer rather than
   * repeating the request.
   *
   * A 401 is the ordinary answer for a signed-out visitor, not a failure, so it resolves to null.
   */
  hydrate(): Observable<AuthUser | null> {
    return this.http.get<AuthUser>(`${this.baseUrl}/me`).pipe(
      catchError(() => of(null)),
      tap((user) => this.current.set(user))
    );
  }

  register(registration: Registration): Observable<AuthUser> {
    return this.http
      .post<AuthUser>(`${this.baseUrl}/register`, registration)
      .pipe(tap((user) => this.current.set(user)));
  }

  login(credentials: Credentials): Observable<AuthUser> {
    return this.http
      .post<AuthUser>(`${this.baseUrl}/login`, credentials)
      .pipe(tap((user) => this.current.set(user)));
  }

  /**
   * Clears the signal even if the request fails. A logout that appears not to have worked because
   * the network blipped is worse than one that is locally true and eventually consistent - the
   * cookie is httpOnly, so the session dies with the server round trip or with its expiry.
   */
  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}).pipe(
      catchError(() => of(undefined)),
      map(() => undefined),
      tap(() => this.current.set(null))
    );
  }
}
