import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AttemptService, AttemptSummary } from '../attempt.service.js';

@Component({
  selector: 'app-history',
  imports: [RouterLink, DatePipe],
  template: `
    <main class="page">
      <div class="page-inner">
        <header class="page-head">
          <div>
            <h1>Results</h1>
            <p class="lede">Every quiz you have taken, most recent first.</p>
          </div>
          <a class="btn" routerLink="/quizzes/browse">Browse quizzes</a>
        </header>

        @if (loading()) {
          <p class="empty-state">Loading…</p>
        } @else if (items().length === 0) {
          <div class="empty-state">
            <p>You have not taken a quiz yet.</p>
          </div>
        } @else {
          @for (attempt of items(); track attempt.id) {
            <div class="card attempt-row">
              <a class="attempt-main" [routerLink]="['/results', attempt.id]">
                <div>
                  <p class="card-title">{{ attempt.quizTitle }}</p>
                  <p class="card-meta">
                    {{ attempt.startedAt | date: 'medium' }}
                    @if (attempt.finishedAt === null) {
                      · unfinished
                    }
                  </p>
                </div>
                <span class="attempt-score">{{ attempt.correct }} / {{ attempt.total }}</span>
              </a>
              <button
                type="button"
                class="btn danger delete-attempt"
                (click)="remove(attempt)"
                [attr.aria-label]="'Delete this result for ' + attempt.quizTitle">
                Delete
              </button>
            </div>
          }
        }
      </div>
    </main>

    @if (pendingDelete(); as attempt) {
      <div
        class="modal-backdrop"
        (click)="cancelDelete()"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title">
        <!-- Stop clicks inside the card from bubbling to the backdrop, which would dismiss it. -->
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h2 id="delete-title" class="modal-title">Delete this result?</h2>
          <p class="modal-body">
            Your run of <strong>{{ attempt.quizTitle }}</strong> — scored
            {{ attempt.correct }} / {{ attempt.total }} — will be removed from your history. This
            cannot be undone.
          </p>
          <div class="modal-actions">
            <button type="button" class="btn" (click)="cancelDelete()" [disabled]="deleting()">
              Keep it
            </button>
            <button
              type="button"
              class="btn danger"
              (click)="confirmDelete()"
              [disabled]="deleting()">
              {{ deleting() ? 'Deleting…' : 'Delete result' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['../../shared/page.css'],
  styles: `
    .attempt-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .attempt-main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      text-decoration: none;
      color: inherit;
      border-radius: 6px;
    }

    .attempt-main:hover,
    .attempt-main:focus-visible {
      outline: none;
      background: #101010;
    }

    .attempt-score {
      font-size: 1.1rem;
      font-weight: 700;
      color: #ff6600;
      font-variant-numeric: tabular-nums;
    }

    .delete-attempt {
      flex-shrink: 0;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: rgba(0, 0, 0, 0.68);
      backdrop-filter: blur(3px);
      z-index: 50;
      animation: backdrop-in 0.15s ease-out;
    }

    .modal-card {
      width: 100%;
      max-width: 26rem;
      padding: 1.5rem;
      background: #141414;
      border: 1px solid #2a2a2a;
      border-radius: 14px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      animation: card-in 0.18s cubic-bezier(0.2, 0.8, 0.3, 1);
    }

    .modal-title {
      margin: 0 0 0.6rem;
      font-size: 1.2rem;
      color: #f5f5f5;
    }

    .modal-body {
      margin: 0 0 1.4rem;
      font-size: 0.95rem;
      line-height: 1.5;
      color: #c8c8c8;
    }

    .modal-body strong {
      color: #f5f5f5;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }

    @keyframes backdrop-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes card-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .modal-backdrop,
      .modal-card {
        animation: none;
      }
    }
  `
})
export class History {
  private readonly attempts = inject(AttemptService);

  protected readonly items = signal<AttemptSummary[]>([]);
  protected readonly loading = signal(true);

  /** The attempt awaiting confirmation, or null when the modal is closed. */
  protected readonly pendingDelete = signal<AttemptSummary | null>(null);
  protected readonly deleting = signal(false);

  constructor() {
    this.attempts.history().subscribe((items) => {
      this.items.set(items);
      this.loading.set(false);
    });
  }

  /** Opens the confirmation modal for a result. The delete itself waits for confirmDelete. */
  protected remove(attempt: AttemptSummary): void {
    this.pendingDelete.set(attempt);
  }

  protected cancelDelete(): void {
    if (this.deleting()) {
      return;
    }

    this.pendingDelete.set(null);
  }

  protected confirmDelete(): void {
    const attempt = this.pendingDelete();

    if (!attempt || this.deleting()) {
      return;
    }

    this.deleting.set(true);

    this.attempts.remove(attempt.id).subscribe({
      next: () => {
        this.items.update((all) => all.filter((item) => item.id !== attempt.id));
        this.deleting.set(false);
        this.pendingDelete.set(null);
      },
      error: () => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
      }
    });
  }
}
