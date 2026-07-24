import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Shell only. Every page is a lazily loaded route - see app.routes.ts.
 *
 * The About me button lives here rather than in each page so it is present everywhere, and
 * routerLinkActive hides it on /about itself - a nav item pointing at the current page is noise.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="shell-nav">
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

    .shell-nav a {
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: #e5e5e5;
      text-decoration: none;
      background: #0b0b0b;
      border-radius: 999px;
      transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
    }

    .shell-nav a:hover,
    .shell-nav a:focus-visible {
      color: #ff6600;
      box-shadow: 0 4px 20px rgba(255, 102, 0, 0.18);
      outline: none;
    }

    /* Message me is the call to action, so it carries the accent while About me stays quiet. */
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
      .shell-nav a {
        transition: none;
      }
    }
  `
})
export class App {}
