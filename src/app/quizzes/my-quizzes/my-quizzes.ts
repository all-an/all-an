import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { QuizService, QuizSummary, StudyField } from '../quiz.service.js';

@Component({
  selector: 'app-my-quizzes',
  imports: [RouterLink],
  templateUrl: './my-quizzes.html',
  styleUrls: ['../../shared/page.css', './my-quizzes.css']
})
export class MyQuizzes {
  private readonly quizzes = inject(QuizService);

  protected readonly loading = signal(true);
  protected readonly items = signal<QuizSummary[]>([]);
  protected readonly fields = signal<StudyField[]>([]);
  protected readonly subjects = signal<string[]>([]);

  protected readonly field = signal<string | null>(null);
  protected readonly subject = signal<string | null>(null);
  protected readonly showArchived = signal(false);

  constructor() {
    forkJoin({
      items: this.quizzes.mine(),
      fields: this.quizzes.studyFields(),
      subjects: this.quizzes.subjects('mine')
    }).subscribe(({ items, fields, subjects }) => {
      this.items.set(items);
      this.fields.set(fields);
      this.subjects.set(subjects);
      this.loading.set(false);
    });
  }

  /** Clicking the selected chip clears it, so filtering never becomes a one-way door. */
  protected toggleField(slug: string): void {
    this.field.set(this.field() === slug ? null : slug);
    this.reload();
  }

  protected toggleSubject(subject: string): void {
    this.subject.set(this.subject() === subject ? null : subject);
    this.reload();
  }

  /** Flips between the active quizzes and the ones set aside as learned. */
  protected setArchivedView(archived: boolean): void {
    if (this.showArchived() === archived) {
      return;
    }

    this.showArchived.set(archived);
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.quizzes
      .mine(this.field() ?? undefined, this.subject() ?? undefined, this.showArchived())
      .subscribe((items) => {
        this.items.set(items);
        this.loading.set(false);
      });
  }

  protected publish(quiz: QuizSummary): void {
    const next = quiz.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';

    this.quizzes.setVisibility(quiz.id, next).subscribe({
      next: (updated) =>
        this.items.update((all) =>
          all.map((item) => (item.id === quiz.id ? { ...item, visibility: updated.visibility } : item))
        ),
      error: (error: { error?: { message?: string } }) =>
        this.error.set(error.error?.message ?? 'Could not change that.')
    });
  }

  protected readonly error = signal('');

  protected remove(quiz: QuizSummary): void {
    // A quiz can represent a lot of typing, and there is no undo behind this.
    if (!confirm(`Delete "${quiz.title}" and all its questions? This cannot be undone.`)) {
      return;
    }

    this.quizzes.remove(quiz.id).subscribe(() => {
      this.items.update((all) => all.filter((item) => item.id !== quiz.id));
    });
  }

  /**
   * Archives an active quiz, or restores an archived one. Either way it leaves the current list,
   * because that list shows exactly one side of the divide.
   */
  protected toggleArchive(quiz: QuizSummary): void {
    const next = !quiz.archived;

    this.quizzes.setArchived(quiz.id, next).subscribe({
      next: () => this.items.update((all) => all.filter((item) => item.id !== quiz.id)),
      error: (error: { error?: { message?: string } }) =>
        this.error.set(error.error?.message ?? 'Could not change that.')
    });
  }
}
