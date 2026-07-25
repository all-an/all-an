import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { Friend, FriendRequest, FriendService } from '../friend.service.js';

@Component({
  selector: 'app-friends-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './friends-page.html',
  styleUrls: ['../../shared/page.css', './friends-page.css']
})
export class FriendsPage {
  private readonly api = inject(FriendService);

  protected readonly friends = signal<Friend[]>([]);
  protected readonly requests = signal<FriendRequest[]>([]);
  protected readonly loading = signal(true);

  protected readonly incoming = computed(() =>
    this.requests().filter((request) => request.direction === 'INCOMING')
  );
  protected readonly outgoing = computed(() =>
    this.requests().filter((request) => request.direction === 'OUTGOING')
  );

  protected readonly username = signal('');
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly sending = signal(false);

  constructor() {
    this.reload();
  }

  private reload(): void {
    forkJoin({ friends: this.api.friends(), requests: this.api.requests() }).subscribe(
      ({ friends, requests }) => {
        this.friends.set(friends);
        this.requests.set(requests);
        this.loading.set(false);
      }
    );
  }

  protected add(): void {
    const name = this.username().trim();

    if (!name || this.sending()) {
      return;
    }

    this.sending.set(true);
    this.error.set('');
    this.notice.set('');

    this.api.request(name).subscribe({
      next: (result) => {
        this.sending.set(false);
        this.username.set('');
        this.notice.set(
          result.status === 'ACCEPTED'
            ? `You and ${name} are now friends - they had already asked you.`
            : `Request sent to ${name}.`
        );
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.sending.set(false);
        this.error.set(err.error?.message ?? 'Could not send that request.');
      }
    });
  }

  protected accept(request: FriendRequest): void {
    this.api.accept(request.friendshipId).subscribe(() => this.reload());
  }

  protected decline(request: FriendRequest): void {
    this.api.removeRequest(request.friendshipId).subscribe(() => this.reload());
  }

  protected unfriend(friend: Friend): void {
    if (!confirm(`Remove ${friend.username} from your friends?`)) {
      return;
    }

    this.api.unfriend(friend.friendshipId).subscribe(() => this.reload());
  }
}
