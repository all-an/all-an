import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { LimitResponse, MessageService } from './message.service';

/** Idle until submitted, then exactly one of the three terminal states. */
type Status = 'idle' | 'sending' | 'sent' | 'limited' | 'error';

@Component({
  selector: 'app-message-me',
  imports: [FormsModule, RouterLink],
  templateUrl: './message-me.html',
  styleUrl: './message-me.css'
})
export class MessageMe {
  private readonly service = inject(MessageService);

  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly body = signal('');

  protected readonly status = signal<Status>('idle');

  /** Populated only on 429. The address is the server's, not a copy hardcoded here. */
  protected readonly limit = signal<LimitResponse | null>(null);
  protected readonly errorText = signal('');

  protected submit(): void {
    if (this.body().trim().length === 0 || this.status() === 'sending') {
      return;
    }

    this.status.set('sending');

    this.service.send({ name: this.name(), email: this.email(), body: this.body() }).subscribe({
      next: () => this.status.set('sent'),
      error: (err: HttpErrorResponse) => this.onError(err)
    });
  }

  /**
   * 429 is the expected outcome of a second message, not a failure - it gets the friendly panel
   * with the fallback address. Everything else is a genuine error.
   */
  private onError(err: HttpErrorResponse): void {
    if (err.status === 429) {
      this.limit.set(err.error as LimitResponse);
      this.status.set('limited');
      return;
    }

    this.errorText.set(
      err.status === 0
        ? 'Could not reach the server. Check your connection and try again.'
        : (err.error?.message ?? 'Something went wrong sending that. Please try again.')
    );
    this.status.set('error');
  }

  /** Back to the form, keeping what was typed so a transient failure costs nothing. */
  protected retry(): void {
    this.status.set('idle');
    this.errorText.set('');
  }
}
