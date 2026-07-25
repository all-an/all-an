import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type QuestionKind = 'MULTIPLE_CHOICE' | 'TYPED';
export type Visibility = 'PRIVATE' | 'PUBLIC';

export interface StudyField {
  id: number;
  slug: string;
  name: string;
  publicQuizCount: number;
}

export interface QuizSummary {
  id: number;
  title: string;
  description: string | null;
  subject: string;
  studyField: { slug: string; name: string };
  visibility: Visibility;
  questionCount: number;
  createdAt: string;
  owned: boolean;
  /** Whether you have archived this quiz. Archived quizzes drop out of the active lists. */
  archived: boolean;
}

export interface QuestionDetail {
  id: number;
  position: number;
  kind: QuestionKind;
  prompt: string;
  explanation: string | null;
  timeLimitSeconds: number;
  /** Whether you have archived this question, so it is skipped when you take the quiz. */
  archived: boolean;
  options: { id: number; body: string; isCorrect: boolean }[];
}

export interface QuizDetail extends QuizSummary {
  studyFieldId: number;
  defaultTimeLimitSeconds: number;
  shuffleQuestions: boolean;
  /** Only ever present for the author - see the API's readQuiz. */
  questions?: QuestionDetail[];
}

export interface QuizInput {
  title: string;
  description?: string;
  studyFieldId: number;
  subject: string;
  defaultTimeLimitSeconds: number;
  shuffleQuestions: boolean;
}

export interface QuestionInput {
  kind: QuestionKind;
  prompt: string;
  explanation?: string;
  timeLimitSeconds?: number;
  options: { body: string; isCorrect: boolean }[];
}

@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/quizzes';

  studyFields(): Observable<StudyField[]> {
    return this.http.get<StudyField[]>(`${this.base}/study-fields`);
  }

  subjects(scope: 'public' | 'mine', studyField?: string): Observable<string[]> {
    const params: Record<string, string> = { scope };

    if (studyField) {
      params['studyField'] = studyField;
    }

    return this.http.get<string[]>(`${this.base}/subjects`, { params });
  }

  mine(studyField?: string, subject?: string, archived = false): Observable<QuizSummary[]> {
    return this.http.get<QuizSummary[]>(this.base, { params: filter(studyField, subject, archived) });
  }

  publicPool(studyField?: string, subject?: string, archived = false): Observable<QuizSummary[]> {
    return this.http.get<QuizSummary[]>(`${this.base}/public`, {
      params: filter(studyField, subject, archived)
    });
  }

  /** Archive or unarchive a quiz for yourself. Works on any quiz you can see. */
  setArchived(id: number, archived: boolean): Observable<void> {
    const url = `${this.base}/${id}/archive`;
    return archived ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }

  /** Archive or unarchive a single question for yourself. */
  setQuestionArchived(questionId: number, archived: boolean): Observable<void> {
    const url = `/api/questions/${questionId}/archive`;
    return archived ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }

  read(id: number): Observable<QuizDetail> {
    return this.http.get<QuizDetail>(`${this.base}/${id}`);
  }

  create(input: QuizInput): Observable<QuizDetail> {
    return this.http.post<QuizDetail>(this.base, input);
  }

  update(id: number, input: QuizInput): Observable<QuizDetail> {
    return this.http.put<QuizDetail>(`${this.base}/${id}`, input);
  }

  setVisibility(id: number, visibility: Visibility): Observable<QuizDetail> {
    return this.http.patch<QuizDetail>(`${this.base}/${id}/visibility`, { visibility });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addQuestion(quizId: number, input: QuestionInput): Observable<QuizDetail> {
    return this.http.post<QuizDetail>(`${this.base}/${quizId}/questions`, input);
  }

  updateQuestion(questionId: number, input: QuestionInput): Observable<QuizDetail> {
    return this.http.put<QuizDetail>(`/api/questions/${questionId}`, input);
  }

  removeQuestion(questionId: number): Observable<QuizDetail> {
    return this.http.delete<QuizDetail>(`/api/questions/${questionId}`);
  }

  reorder(quizId: number, questionIds: number[]): Observable<QuizDetail> {
    return this.http.patch<QuizDetail>(`${this.base}/${quizId}/order`, { questionIds });
  }

  shareQuiz(quizId: number, friendIds: number[]): Observable<{ shared: number }> {
    return this.http.post<{ shared: number }>(`${this.base}/${quizId}/shares`, { friendIds });
  }

  shareQuestion(questionId: number, friendIds: number[]): Observable<{ shared: number }> {
    return this.http.post<{ shared: number }>(`/api/questions/${questionId}/shares`, { friendIds });
  }
}

/** Omits absent filters rather than sending empty strings the API would have to interpret. */
function filter(studyField?: string, subject?: string, archived = false): Record<string, string> {
  const params: Record<string, string> = {};

  if (studyField) {
    params['studyField'] = studyField;
  }

  if (subject) {
    params['subject'] = subject;
  }

  if (archived) {
    params['archived'] = 'true';
  }

  return params;
}
