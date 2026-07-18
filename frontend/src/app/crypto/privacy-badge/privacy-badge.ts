import { Component, computed, input } from '@angular/core';

import { PrivacyLevel } from '../crypto.service';

/**
 * Presentational. Colours the privacy level so MANDATORY reads differently from OPTIONAL at a
 * glance - which is the entire argument the table is making.
 */
@Component({
  selector: 'app-privacy-badge',
  template: `
    <span class="badge" [class]="level()" [title]="hint()">
      {{ level() }}
    </span>
  `,
  styles: `
    .badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .MANDATORY {
      background: rgba(255, 102, 0, 0.15);
      color: #ff8c3a;
      border: 1px solid rgba(255, 102, 0, 0.4);
    }
    .OPTIONAL {
      background: rgba(234, 179, 8, 0.12);
      color: #eab308;
      border: 1px solid rgba(234, 179, 8, 0.35);
    }
    .NONE {
      background: rgba(120, 120, 120, 0.12);
      color: #8a8a8a;
      border: 1px solid rgba(120, 120, 120, 0.3);
    }
  `
})
export class PrivacyBadge {
  readonly level = input.required<PrivacyLevel>();

  protected readonly hint = computed(() => {
    switch (this.level()) {
      case 'MANDATORY':
        return 'Every transaction is private. Anonymity set = the whole chain.';
      case 'OPTIONAL':
        return 'Privacy is opt-in, so the anonymity set is only the shielded pool.';
      default:
        return 'Transparent ledger. Pseudonymous at best.';
    }
  });
}
