import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { QuestionKind } from './quiz.service.js';

export interface CurrentQuestion {
  attemptQuestionId: number;
  /** The underlying question id, so it can be archived ("learned") mid-run. */
  questionId: number;
  position: number;
  total: number;
  prompt: string;
  kind: QuestionKind;
  /** Absent for a typed question, and never carries which one is right. */
  options?: { id: number; body: string }[];
  timeLimitSeconds: number;
  remainingMs: number;
}

export interface AnswerResult {
  correct: boolean;
  timedOut: boolean;
  correctAnswer: string;
  explanation: string | null;
  finished: boolean;
}

export interface AttemptSummary {
  id: number;
  quizId: number | null;
  quizTitle: string;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  answered: number;
  correct: number;
}

export interface AttemptResult extends AttemptSummary {
  questions: {
    position: number;
    prompt: string;
    yourAnswer: string | null;
    correctAnswer: string | null;
    isCorrect: boolean | null;
    timedOut: boolean;
    elapsedMs: number | null;
  }[];
}

@Injectable({ providedIn: 'root' })
export class AttemptService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/attempts';

  start(quizId: number): Observable<{ attemptId: number; total: number }> {
    return this.http.post<{ attemptId: number; total: number }>(this.base, { quizId });
  }

  current(attemptId: number): Observable<CurrentQuestion | { finished: true }> {
    return this.http.get<CurrentQuestion | { finished: true }>(`${this.base}/${attemptId}/current`);
  }

  answer(
    attemptId: number,
    given: { optionId?: number; text?: string }
  ): Observable<AnswerResult> {
    return this.http.post<AnswerResult>(`${this.base}/${attemptId}/answer`, given);
  }

  finish(attemptId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/${attemptId}/finish`, {});
  }

  result(attemptId: number): Observable<AttemptResult> {
    return this.http.get<AttemptResult>(`${this.base}/${attemptId}`);
  }

  history(): Observable<AttemptSummary[]> {
    return this.http.get<AttemptSummary[]>(this.base);
  }

  /** Removes one attempt from your history. */
  remove(attemptId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${attemptId}`);
  }
}
