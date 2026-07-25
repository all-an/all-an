import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AnswerResult, AttemptService, CurrentQuestion } from '../attempt.service.js';
import { QuizService } from '../quiz.service.js';

type Phase = 'loading' | 'asking' | 'feedback' | 'error';

@Component({
  selector: 'app-runner',
  imports: [FormsModule],
  templateUrl: './runner.html',
  styleUrls: ['../../shared/page.css', './runner.css']
})
export class Runner implements OnDestroy {
  private readonly attempts = inject(AttemptService);
  private readonly quizzes = inject(QuizService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly phase = signal<Phase>('loading');
  protected readonly question = signal<CurrentQuestion | null>(null);
  protected readonly feedback = signal<AnswerResult | null>(null);
  protected readonly errorText = signal('');

  /** Whether the taker archived the current question during its feedback step. */
  protected readonly archivedThis = signal(false);

  protected readonly typed = signal('');
  protected readonly chosen = signal<number | null>(null);

  protected readonly remainingMs = signal(0);
  protected readonly remainingSeconds = computed(() => Math.ceil(this.remainingMs() / 1000));

  /** How much of the bar is left, as a percentage. */
  protected readonly remainingPercent = computed(() => {
    const total = (this.question()?.timeLimitSeconds ?? 1) * 1000;
    return Math.max(0, Math.min(100, (this.remainingMs() / total) * 100));
  });

  private attemptId = 0;
  private ticker: ReturnType<typeof setInterval> | undefined;
  private deadline = 0;

  constructor() {
    this.attemptId = Number(this.route.snapshot.paramMap.get('attemptId'));
    this.loadNext();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  private loadNext(): void {
    this.phase.set('loading');
    this.typed.set('');
    this.chosen.set(null);
    this.feedback.set(null);
    this.archivedThis.set(false);

    this.attempts.current(this.attemptId).subscribe({
      next: (result) => {
        if ('finished' in result) {
          void this.router.navigate(['/results', this.attemptId]);
          return;
        }

        this.question.set(result);
        this.phase.set('asking');
        this.startTimer(result.remainingMs);
      },
      error: (error: HttpErrorResponse) => {
        this.errorText.set(error.error?.message ?? 'Could not load that question.');
        this.phase.set('error');
      }
    });
  }

  /**
   * Starts the visible countdown.
   *
   * Seeded with the server's remainingMs rather than the question's full limit, so reloading
   * mid-question resumes where it was. This clock is presentation only - the server decides
   * whether an answer was late, from the moment it handed the question out. Getting it slightly
   * wrong here changes what you see, never what you score.
   */
  private startTimer(remainingMs: number): void {
    this.stopTimer();
    this.deadline = Date.now() + remainingMs;
    this.remainingMs.set(remainingMs);

    this.ticker = setInterval(() => {
      const left = this.deadline - Date.now();
      this.remainingMs.set(Math.max(0, left));

      if (left <= 0) {
        this.stopTimer();
        // Submit whatever is there. Running out of time is an answer, and the server will mark it
        // late regardless of what arrives.
        this.submit();
      }
    }, 100);
  }

  private stopTimer(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  protected submit(): void {
    if (this.phase() !== 'asking') {
      return;
    }

    this.stopTimer();
    this.phase.set('loading');

    const question = this.question();
    const given =
      question?.kind === 'MULTIPLE_CHOICE'
        ? { optionId: this.chosen() ?? undefined }
        : { text: this.typed() };

    this.attempts.answer(this.attemptId, given).subscribe({
      next: (result) => {
        this.feedback.set(result);
        this.phase.set('feedback');
      },
      error: (error: HttpErrorResponse) => {
        this.errorText.set(error.error?.message ?? 'Could not send that answer.');
        this.phase.set('error');
      }
    });
  }

  /**
   * Marks the question just answered as learned, so it is skipped in future runs of this quiz.
   * Only offered on the feedback step, when questionId is known and the answer is already in.
   */
  protected archiveCurrent(): void {
    const question = this.question();

    if (!question || this.archivedThis()) {
      return;
    }

    this.quizzes.setQuestionArchived(question.questionId, true).subscribe(() => {
      this.archivedThis.set(true);
    });
  }

  protected next(): void {
    if (this.feedback()?.finished) {
      void this.router.navigate(['/results', this.attemptId]);
      return;
    }

    this.loadNext();
  }

  protected quit(): void {
    this.attempts.finish(this.attemptId).subscribe(() => {
      void this.router.navigate(['/results', this.attemptId]);
    });
  }
}
