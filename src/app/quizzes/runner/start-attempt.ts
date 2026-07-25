import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AttemptService } from '../attempt.service.js';

/**
 * Starts an attempt, then hands over to the runner.
 *
 * A separate step because starting one is a POST that creates a row. Doing it inside the runner
 * would mean a refresh of the runner's URL silently began a second attempt, and the history would
 * fill with abandoned one-question runs.
 */
@Component({
  selector: 'app-start-attempt',
  imports: [RouterLink],
  template: `
    <main class="page">
      <div class="page-inner">
        @if (error()) {
          <p class="notice" role="alert">{{ error() }}</p>
          <a class="btn" routerLink="/quizzes">Back to my quizzes</a>
        } @else {
          <p class="empty-state">Starting…</p>
        }
      </div>
    </main>
  `,
  styleUrl: '../../shared/page.css'
})
export class StartAttempt {
  private readonly attempts = inject(AttemptService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly error = signal('');

  constructor() {
    const quizId = Number(this.route.snapshot.paramMap.get('id'));

    this.attempts.start(quizId).subscribe({
      next: ({ attemptId }) =>
        // replaceUrl so the back button returns to the quiz rather than restarting the attempt.
        void this.router.navigate(['/quizzes/attempt', attemptId], { replaceUrl: true }),
      error: (err: HttpErrorResponse) =>
        this.error.set(err.error?.message ?? 'Could not start that quiz.')
    });
  }
}
