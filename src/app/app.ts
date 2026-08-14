import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './auth/auth.service.js';

/**
 * Shell only. Every page is a lazily loaded route - see app.routes.ts.
 *
 * The nav lives here rather than in each page so it is present everywhere, and routerLinkActive
 * hides an item on its own page - a nav link pointing at the current page is noise.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="shell-nav">
      @if (auth.isSignedIn()) {
        <a routerLink="/quizzes" routerLinkActive="is-active">My quizzes</a>
        <a routerLink="/quizzes/browse" routerLinkActive="is-active">Browse</a>
        <a routerLink="/results" routerLinkActive="is-active">Results</a>
        <a routerLink="/friends" routerLinkActive="is-active">Friends</a>
        @if (auth.isAdmin()) {
          <a routerLink="/admin" routerLinkActive="is-active">Admin</a>
        }
        <button type="button" (click)="signOut()">Sign out</button>
      } @else {
        <a routerLink="/quizzes/browse" routerLinkActive="is-active">Browse</a>
        <a routerLink="/login" routerLinkActive="is-active">Sign in</a>
      }
      <a routerLink="/about" routerLinkActive="is-active">About me</a>
      <a class="primary" routerLink="/message" routerLinkActive="is-active">Message me</a>
    </nav>
    <router-outlet />
  `,
  styles: `
    .shell-nav {
      position: fixed;
      top: 1.25rem;
      right: 1.5rem;
      z-index: 10;
      display: flex;
      gap: 0.6rem;
    }

    .shell-nav a,
    .shell-nav button {
      padding: 0.5rem 1rem;
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      color: #e5e5e5;
      text-decoration: none;
      background: #0b0b0b;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      transition:
        color 0.18s ease,
        background 0.18s ease,
        box-shadow 0.18s ease;
    }

    .shell-nav a:hover,
    .shell-nav a:focus-visible,
    .shell-nav button:hover,
    .shell-nav button:focus-visible {
      color: #ff6600;
      box-shadow: 0 4px 20px rgba(255, 102, 0, 0.18);
      outline: none;
    }

    /* Message me is the call to action, so it carries the accent while the rest stay quiet. */
    .shell-nav a.primary {
      color: #ff6600;
      background: rgba(255, 102, 0, 0.1);
    }

    .shell-nav a.primary:hover,
    .shell-nav a.primary:focus-visible {
      background: rgba(255, 102, 0, 0.18);
    }

    .shell-nav a.is-active {
      display: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .shell-nav a,
      .shell-nav button {
        transition: none;
      }
    }
  `
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected signOut(): void {
    // Home rather than staying put: the current page may well be one the guard would now bounce,
    // and being redirected to a sign-in form immediately after signing out reads as a failure.
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/'));
  }
}
