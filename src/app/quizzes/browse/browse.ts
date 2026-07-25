import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../auth/auth.service.js';
import { QuizService, QuizSummary, StudyField } from '../quiz.service.js';

@Component({
  selector: 'app-browse',
  imports: [RouterLink],
  templateUrl: './browse.html',
  styleUrls: ['../../shared/page.css', './browse.css']
})
export class Browse {
  private readonly quizzes = inject(QuizService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly items = signal<QuizSummary[]>([]);
  protected readonly fields = signal<StudyField[]>([]);
  protected readonly subjects = signal<string[]>([]);
  protected readonly field = signal<string | null>(null);
  protected readonly subject = signal<string | null>(null);
  protected readonly showArchived = signal(false);

  /** Archiving is a per-user thing, so the controls only make sense for a signed-in visitor. */
  protected readonly signedIn = this.auth.isSignedIn;

  constructor() {
    // The study field is in the path rather than a query parameter, so a field's page is a link
    // somebody can send.
    const slug = this.route.snapshot.paramMap.get('studyField');
    this.field.set(slug);

    forkJoin({
      items: this.quizzes.publicPool(slug ?? undefined),
      fields: this.quizzes.studyFields(),
      subjects: this.quizzes.subjects('public', slug ?? undefined)
    }).subscribe(({ items, fields, subjects }) => {
      this.items.set(items);
      this.fields.set(fields);
      this.subjects.set(subjects);
      this.loading.set(false);
    });
  }

  protected selectField(slug: string): void {
    void this.router.navigate(this.field() === slug ? ['/quizzes/browse'] : ['/quizzes/browse', slug]);
  }

  protected toggleSubject(name: string): void {
    this.subject.set(this.subject() === name ? null : name);
    this.reload();
  }

  /** Flips between the pool and the quizzes this viewer has archived out of it. */
  protected setArchivedView(archived: boolean): void {
    if (this.showArchived() === archived) {
      return;
    }

    this.showArchived.set(archived);
    this.reload();
  }

  protected toggleArchive(quiz: QuizSummary): void {
    const next = !quiz.archived;

    this.quizzes.setArchived(quiz.id, next).subscribe(() => {
      // The card belongs to whichever view it just left, so drop it from the one on screen.
      this.items.update((all) => all.filter((item) => item.id !== quiz.id));
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.quizzes
      .publicPool(this.field() ?? undefined, this.subject() ?? undefined, this.showArchived())
      .subscribe((items) => {
        this.items.set(items);
        this.loading.set(false);
      });
  }
}
