import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { Friend, FriendService } from '../../friends/friend.service.js';
import {
  QuestionDetail,
  QuestionInput,
  QuestionKind,
  QuizDetail,
  QuizService,
  StudyField
} from '../quiz.service.js';

/** A choice being edited. Carries no id: options are replaced wholesale on save. */
interface DraftOption {
  body: string;
  isCorrect: boolean;
}

@Component({
  selector: 'app-quiz-editor',
  imports: [FormsModule, RouterLink],
  templateUrl: './quiz-editor.html',
  styleUrls: ['../../shared/page.css', './quiz-editor.css']
})
export class QuizEditor {
  private readonly quizzes = inject(QuizService);
  private readonly friendsApi = inject(FriendService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly quizId = signal<number | null>(null);
  protected readonly isNew = computed(() => this.quizId() === null);

  protected readonly fields = signal<StudyField[]>([]);
  protected readonly knownSubjects = signal<string[]>([]);
  protected readonly friends = signal<Friend[]>([]);

  // --- quiz details ---
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly studyFieldId = signal<number | null>(null);
  protected readonly subject = signal('');
  protected readonly defaultTimeLimit = signal(30);
  protected readonly shuffle = signal(false);
  protected readonly visibility = signal<'PRIVATE' | 'PUBLIC'>('PRIVATE');

  protected readonly questions = signal<QuestionDetail[]>([]);

  protected readonly saving = signal(false);
  protected readonly notice = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});

  // --- the question being written ---
  protected readonly editingQuestionId = signal<number | null>(null);
  protected readonly qKind = signal<QuestionKind>('MULTIPLE_CHOICE');
  protected readonly qPrompt = signal('');
  protected readonly qExplanation = signal('');
  protected readonly qTimeLimit = signal<number | null>(null);
  protected readonly qOptions = signal<DraftOption[]>([
    { body: '', isCorrect: true },
    { body: '', isCorrect: false }
  ]);
  protected readonly questionFormOpen = signal(false);

  // --- sharing ---
  protected readonly sharingQuiz = signal(false);
  protected readonly sharingQuestionId = signal<number | null>(null);
  protected readonly selectedFriends = signal<number[]>([]);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');

    forkJoin({
      fields: this.quizzes.studyFields(),
      subjects: this.quizzes.subjects('mine'),
      friends: this.friendsApi.friends()
    }).subscribe(({ fields, subjects, friends }) => {
      this.fields.set(fields);
      this.knownSubjects.set(subjects);
      this.friends.set(friends);

      // Default to the first field so the select is never sitting on a blank option.
      this.studyFieldId.update((current) => current ?? fields[0]?.id ?? null);
    });

    if (id) {
      this.quizzes.read(Number(id)).subscribe((quiz) => this.load(quiz));
    }
  }

  private load(quiz: QuizDetail): void {
    this.quizId.set(quiz.id);
    this.title.set(quiz.title);
    this.description.set(quiz.description ?? '');
    this.studyFieldId.set(quiz.studyFieldId);
    this.subject.set(quiz.subject);
    this.defaultTimeLimit.set(quiz.defaultTimeLimitSeconds);
    this.shuffle.set(quiz.shuffleQuestions);
    this.visibility.set(quiz.visibility);
    this.questions.set(quiz.questions ?? []);
  }

  // --- saving the quiz itself ---

  protected saveQuiz(): void {
    if (this.saving()) {
      return;
    }

    // The select can hand back a string ("3") depending on how the option value is bound; the API
    // wants a real number. Coerce here so a stray string never reaches it.
    const raw = this.studyFieldId();
    const studyFieldId = raw === null ? NaN : Number(raw);

    if (!Number.isInteger(studyFieldId)) {
      this.fieldErrors.set({ studyFieldId: 'Pick a study field from the list.' });
      return;
    }

    this.saving.set(true);
    this.fieldErrors.set({});
    this.notice.set('');

    const input = {
      title: this.title(),
      description: this.description(),
      studyFieldId,
      subject: this.subject(),
      defaultTimeLimitSeconds: this.defaultTimeLimit(),
      shuffleQuestions: this.shuffle()
    };

    const id = this.quizId();
    const request = id === null ? this.quizzes.create(input) : this.quizzes.update(id, input);

    request.subscribe({
      next: (quiz) => {
        this.saving.set(false);
        this.load(quiz);
        this.notice.set('Saved.');

        // A newly created quiz needs a real URL, or a refresh would start a second empty one.
        if (id === null) {
          void this.router.navigate(['/quizzes', quiz.id, 'edit'], { replaceUrl: true });
        }
      },
      error: (error: HttpErrorResponse) => this.onError(error)
    });
  }

  private onError(error: HttpErrorResponse): void {
    this.saving.set(false);

    if (error.status === 400 && error.error?.fields) {
      const fields = error.error.fields as Record<string, string>;
      this.fieldErrors.set(fields);

      // Surface the specific messages in the notice too. Nested paths like "options.0.body" have
      // no error slot in the template, so without this a validation failure just snaps the button
      // back to "Save" with nothing on screen and looks like a dead button.
      const messages = [...new Set(Object.values(fields))];
      this.notice.set(
        messages.length ? messages.join(' ') : (error.error?.message ?? 'Please check the form.')
      );
      return;
    }

    this.notice.set(error.error?.message ?? 'Something went wrong. Please try again.');
  }

  protected togglePublish(): void {
    const id = this.quizId();

    if (id === null) {
      return;
    }

    const next = this.visibility() === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';

    this.quizzes.setVisibility(id, next).subscribe({
      next: (quiz) => {
        this.visibility.set(quiz.visibility);
        this.notice.set(quiz.visibility === 'PUBLIC' ? 'Published to the pool.' : 'Unpublished.');
      },
      error: (error: HttpErrorResponse) => this.onError(error)
    });
  }

  // --- questions ---

  protected newQuestion(): void {
    this.editingQuestionId.set(null);
    this.qKind.set('MULTIPLE_CHOICE');
    this.qPrompt.set('');
    this.qExplanation.set('');
    this.qTimeLimit.set(this.defaultTimeLimit());
    this.qOptions.set([
      { body: '', isCorrect: true },
      { body: '', isCorrect: false }
    ]);
    this.questionFormOpen.set(true);
  }

  protected editQuestion(question: QuestionDetail): void {
    this.editingQuestionId.set(question.id);
    this.qKind.set(question.kind);
    this.qPrompt.set(question.prompt);
    this.qExplanation.set(question.explanation ?? '');
    this.qTimeLimit.set(question.timeLimitSeconds);
    this.qOptions.set(question.options.map((o) => ({ body: o.body, isCorrect: o.isCorrect })));
    this.questionFormOpen.set(true);
  }

  /**
   * Switching kind reshapes the answers rather than discarding them: the choices someone typed
   * are usually still the answer they meant, and losing them on a mis-click is infuriating.
   */
  protected setKind(kind: QuestionKind): void {
    this.qKind.set(kind);

    if (kind === 'TYPED') {
      const filled = this.qOptions().filter((option) => option.body.trim());
      this.qOptions.set(
        filled.length ? filled.map((o) => ({ ...o, isCorrect: true })) : [{ body: '', isCorrect: true }]
      );
      return;
    }

    const current = this.qOptions();
    this.qOptions.set(
      current.length >= 2 ? current : [...current, { body: '', isCorrect: false }]
    );
  }

  protected addOption(): void {
    this.qOptions.update((options) => [...options, { body: '', isCorrect: false }]);
  }

  protected removeOption(index: number): void {
    this.qOptions.update((options) => options.filter((_, i) => i !== index));
  }

  protected setOptionBody(index: number, body: string): void {
    this.qOptions.update((options) =>
      options.map((option, i) => (i === index ? { ...option, body } : option))
    );
  }

  /** Exactly one correct choice, radio-style. Multiple correct answers confuse more than they help. */
  protected setCorrect(index: number): void {
    this.qOptions.update((options) =>
      options.map((option, i) => ({ ...option, isCorrect: i === index }))
    );
  }

  protected saveQuestion(): void {
    const quizId = this.quizId();

    if (quizId === null || this.saving()) {
      return;
    }

    const input: QuestionInput = {
      kind: this.qKind(),
      prompt: this.qPrompt(),
      explanation: this.qExplanation(),
      options: this.qOptions().filter((option) => option.body.trim().length > 0)
    };

    const limit = this.qTimeLimit();

    if (limit !== null && limit !== undefined && `${limit}`.trim() !== '') {
      input.timeLimitSeconds = Number(limit);
    }

    this.saving.set(true);
    this.fieldErrors.set({});
    this.notice.set('');

    const editing = this.editingQuestionId();
    const request = editing
      ? this.quizzes.updateQuestion(editing, input)
      : this.quizzes.addQuestion(quizId, input);

    request.subscribe({
      next: (quiz) => {
        this.saving.set(false);
        this.questions.set(quiz.questions ?? []);
        this.questionFormOpen.set(false);
        this.notice.set('');
      },
      error: (error: HttpErrorResponse) => this.onError(error)
    });
  }

  /**
   * The answer, for the author's own list. Safe here and nowhere else: this data only ever
   * reaches the browser when the person asking owns the quiz.
   */
  protected correctAnswerOf(question: QuestionDetail): string {
    const correct = question.options.filter((option) => option.isCorrect).map((o) => o.body);
    return correct.length ? correct.join(' / ') : '—';
  }

  protected removeQuestion(question: QuestionDetail): void {
    if (!confirm('Delete this question?')) {
      return;
    }

    this.quizzes.removeQuestion(question.id).subscribe((quiz) => {
      this.questions.set(quiz.questions ?? []);
    });
  }

  /**
   * Archives a question you have learned, or restores it. Archived questions stay in the editor,
   * greyed, but are skipped the next time you take the quiz.
   */
  protected toggleQuestionArchive(question: QuestionDetail): void {
    const next = !question.archived;

    this.quizzes.setQuestionArchived(question.id, next).subscribe(() => {
      this.questions.update((all) =>
        all.map((item) => (item.id === question.id ? { ...item, archived: next } : item))
      );
    });
  }

  protected move(question: QuestionDetail, delta: number): void {
    const quizId = this.quizId();
    const order = this.questions().map((item) => item.id);
    const from = order.indexOf(question.id);
    const to = from + delta;

    if (quizId === null || to < 0 || to >= order.length) {
      return;
    }

    [order[from], order[to]] = [order[to]!, order[from]!];

    this.quizzes.reorder(quizId, order).subscribe((quiz) => {
      this.questions.set(quiz.questions ?? []);
    });
  }

  // --- sharing ---

  protected openQuizShare(): void {
    this.selectedFriends.set([]);
    this.sharingQuestionId.set(null);
    this.sharingQuiz.set(true);
  }

  protected openQuestionShare(question: QuestionDetail): void {
    this.selectedFriends.set([]);
    this.sharingQuiz.set(false);
    this.sharingQuestionId.set(question.id);
  }

  protected closeShare(): void {
    this.sharingQuiz.set(false);
    this.sharingQuestionId.set(null);
  }

  protected toggleFriend(id: number): void {
    this.selectedFriends.update((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
    );
  }

  protected confirmShare(): void {
    const friendIds = this.selectedFriends();
    const quizId = this.quizId();
    const questionId = this.sharingQuestionId();

    if (friendIds.length === 0 || this.saving()) {
      return;
    }

    this.saving.set(true);

    const request =
      questionId !== null
        ? this.quizzes.shareQuestion(questionId, friendIds)
        : this.quizzes.shareQuiz(quizId!, friendIds);

    request.subscribe({
      next: (result) => {
        this.saving.set(false);
        this.closeShare();
        this.notice.set(
          result.shared === 0
            ? 'Already shared with everyone you picked.'
            : `Shared with ${result.shared} friend${result.shared === 1 ? '' : 's'}.`
        );
      },
      error: (error: HttpErrorResponse) => {
        this.closeShare();
        this.onError(error);
      }
    });
  }
}
