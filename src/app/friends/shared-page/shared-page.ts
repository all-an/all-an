import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { QuizService, QuizSummary } from '../../quizzes/quiz.service.js';
import { FriendService, SharedQuestion, SharedQuiz } from '../friend.service.js';

@Component({
  selector: 'app-shared-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './shared-page.html',
  styleUrls: ['../../shared/page.css', './shared-page.css']
})
export class SharedPage {
  private readonly api = inject(FriendService);
  private readonly quizzes = inject(QuizService);

  protected readonly quizShares = signal<SharedQuiz[]>([]);
  protected readonly questionShares = signal<SharedQuestion[]>([]);
  /** The quizzes the viewer owns, as copy destinations. */
  protected readonly ownQuizzes = signal<QuizSummary[]>([]);
  protected readonly loading = signal(true);

  /** Which shared question has its "copy into…" picker open, and where it would go. */
  protected readonly copyingShareId = signal<number | null>(null);
  protected readonly copyTarget = signal<number | null>(null);

  protected readonly notice = signal('');
  protected readonly error = signal('');

  constructor() {
    forkJoin({ shared: this.api.shared(), mine: this.quizzes.mine() }).subscribe(
      ({ shared, mine }) => {
        this.quizShares.set(shared.quizzes);
        this.questionShares.set(shared.questions);
        this.ownQuizzes.set(mine);
        this.copyTarget.set(mine[0]?.id ?? null);
        this.loading.set(false);
      }
    );
  }

  protected openCopy(share: SharedQuestion): void {
    this.copyingShareId.set(share.shareId);
  }

  protected copy(): void {
    const shareId = this.copyingShareId();
    const quizId = this.copyTarget();

    if (shareId === null || quizId === null) {
      return;
    }

    this.api.copyQuestion(shareId, quizId).subscribe({
      next: () => {
        this.copyingShareId.set(null);
        this.notice.set('Copied into your quiz.');
        this.questionShares.update((shares) =>
          shares.map((share) => (share.shareId === shareId ? { ...share, copied: true } : share))
        );
      },
      error: (err: HttpErrorResponse) =>
        this.error.set(err.error?.message ?? 'Could not copy that question.')
    });
  }

  protected dismissQuiz(share: SharedQuiz): void {
    this.api.dismissQuiz(share.shareId).subscribe(() => {
      this.quizShares.update((shares) => shares.filter((item) => item.shareId !== share.shareId));
    });
  }

  protected dismissQuestion(share: SharedQuestion): void {
    this.api.dismissQuestion(share.shareId).subscribe(() => {
      this.questionShares.update((shares) =>
        shares.filter((item) => item.shareId !== share.shareId)
      );
    });
  }
}
