import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface CreateMessageRequest {
  name: string;
  email: string;
  body: string;
}

export interface MessageResponse {
  id: number;
  createdAt: string;
}

/** The 429 body. `contactEmail` comes from the server so the address lives in one place. */
export interface LimitResponse {
  message: string;
  contactEmail: string;
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/messages';

  send(request: CreateMessageRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(this.baseUrl, request);
  }
}
