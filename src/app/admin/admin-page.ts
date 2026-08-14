import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

import { SettingsService, SiteSettings } from '../settings/settings.service.js';

/**
 * The site's switches, for an administrator.
 *
 * Edits are held locally and written by an explicit Save rather than on every toggle. The API takes
 * the whole settings document per write, so saving on each change would post the others too - and
 * closing registration is not something a stray click should do at the moment of the click.
 */
@Component({
  selector: 'app-admin-page',
  templateUrl: './admin-page.html',
  styleUrls: ['../shared/page.css', './admin-page.css']
})
export class AdminPage {
  private readonly api = inject(SettingsService);

  /** What was last loaded or saved. Compared against the draft to know whether Save has work. */
  private readonly saved = signal<SiteSettings | null>(null);
  protected readonly draft = signal<SiteSettings | null>(null);

  protected readonly loading = computed(() => this.draft() === null);
  protected readonly dirty = computed(() => {
    const [saved, draft] = [this.saved(), this.draft()];

    return (
      saved !== null && draft !== null && saved.registrationEnabled !== draft.registrationEnabled
    );
  });

  protected readonly sending = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');

  constructor() {
    this.api.load().subscribe((settings) => {
      this.saved.set(settings);
      this.draft.set({ ...settings });
    });
  }

  protected setRegistrationEnabled(enabled: boolean): void {
    const draft = this.draft();

    if (draft) {
      this.draft.set({ ...draft, registrationEnabled: enabled });
      // Last save's confirmation, now describing something that is no longer what the form says.
      this.notice.set('');
      this.error.set('');
    }
  }

  protected save(): void {
    const draft = this.draft();

    if (!draft || this.sending() || !this.dirty()) {
      return;
    }

    this.sending.set(true);
    this.notice.set('');
    this.error.set('');

    this.api.save(draft).subscribe({
      next: (settings) => {
        this.sending.set(false);
        this.saved.set(settings);
        this.draft.set({ ...settings });
        this.notice.set(
          settings.registrationEnabled
            ? 'Saved. Anyone can create an account.'
            : 'Saved. New accounts are closed.'
        );
      },
      error: (err: HttpErrorResponse) => {
        this.sending.set(false);
        // The draft is left alone: the switch keeps showing what they asked for, so Save can be
        // pressed again rather than the change silently reverting under them.
        this.error.set(err.error?.message ?? 'Could not save that. Please try again.');
      }
    });
  }
}
