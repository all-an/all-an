import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Friend {
  friendshipId: number;
  id: number;
  username: string;
  since: string;
}

export interface FriendRequest {
  friendshipId: number;
  id: number;
  username: string;
  direction: 'INCOMING' | 'OUTGOING';
  requestedAt: string;
}

export interface SharedQuiz {
  shareId: number;
  quizId: number;
  title: string;
  subject: string;
  studyField: string;
  questionCount: number;
  sharedBy: string;
  sharedAt: string;
}

export interface SharedQuestion {
  shareId: number;
  questionId: number | null;
  prompt: string;
  kind: 'MULTIPLE_CHOICE' | 'TYPED';
  timeLimitSeconds: number;
  sharedBy: string;
  sharedAt: string;
  copied: boolean;
}

@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly http = inject(HttpClient);

  friends(): Observable<Friend[]> {
    return this.http.get<Friend[]>('/api/friends');
  }

  requests(): Observable<FriendRequest[]> {
    return this.http.get<FriendRequest[]>('/api/friends/requests');
  }

  request(username: string): Observable<{ status: 'PENDING' | 'ACCEPTED' }> {
    return this.http.post<{ status: 'PENDING' | 'ACCEPTED' }>('/api/friends/requests', {
      username
    });
  }

  accept(friendshipId: number): Observable<void> {
    return this.http.post<void>(`/api/friends/requests/${friendshipId}/accept`, {});
  }

  /** Declines an incoming request or withdraws one you sent - the same row either way. */
  removeRequest(friendshipId: number): Observable<void> {
    return this.http.delete<void>(`/api/friends/requests/${friendshipId}`);
  }

  unfriend(friendshipId: number): Observable<void> {
    return this.http.delete<void>(`/api/friends/${friendshipId}`);
  }

  shared(): Observable<{ quizzes: SharedQuiz[]; questions: SharedQuestion[] }> {
    return this.http.get<{ quizzes: SharedQuiz[]; questions: SharedQuestion[] }>('/api/shares');
  }

  copyQuestion(shareId: number, quizId: number): Observable<{ questionId: number }> {
    return this.http.post<{ questionId: number }>(`/api/shares/questions/${shareId}/copy`, {
      quizId
    });
  }

  dismissQuiz(shareId: number): Observable<void> {
    return this.http.delete<void>(`/api/shares/quizzes/${shareId}`);
  }

  dismissQuestion(shareId: number): Observable<void> {
    return this.http.delete<void>(`/api/shares/questions/${shareId}`);
  }
}
