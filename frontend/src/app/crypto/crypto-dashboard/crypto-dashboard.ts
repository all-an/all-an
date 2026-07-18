import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Cryptocurrency, CryptoService, PrivacyLevel } from '../crypto.service';
import { CryptoTable, SortKey } from '../crypto-table/crypto-table';

type PrivacyFilter = PrivacyLevel | 'ALL';

/**
 * Container: owns the data and the view state, hands rows to the presentational table.
 *
 * The whole point of this component is `visibleRows` - one computed() that derives the view from
 * three signals. Change a filter and the table redraws with no subscription, no ngOnChanges and no
 * manual bookkeeping.
 */
@Component({
  selector: 'app-crypto-dashboard',
  imports: [FormsModule, RouterLink, CryptoTable],
  templateUrl: './crypto-dashboard.html',
  styleUrl: './crypto-dashboard.css'
})
export class CryptoDashboard implements OnInit {
  private readonly service = inject(CryptoService);

  // --- raw state ---
  private readonly all = signal<Cryptocurrency[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  // --- view state ---
  protected readonly search = signal('');
  protected readonly privacyFilter = signal<PrivacyFilter>('ALL');
  protected readonly sortKey = signal<SortKey>('rank');
  protected readonly sortAsc = signal(true);

  // --- derived ---
  protected readonly visibleRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const privacy = this.privacyFilter();
    const key = this.sortKey();
    const direction = this.sortAsc() ? 1 : -1;

    const filtered = this.all()
      .filter((c) => privacy === 'ALL' || c.privacy === privacy)
      .filter(
        (c) =>
          term === '' ||
          c.name.toLowerCase().includes(term) ||
          c.symbol.toLowerCase().includes(term)
      );

    // copy before sorting: sort() mutates, and mutating the source signal's array in a computed
    // would be a side effect on state we do not own
    return [...filtered].sort((a, b) => this.compare(a, b, key) * direction);
  });

  protected readonly privateCount = computed(
    () => this.all().filter((c) => c.privacyByDefault).length
  );

  protected readonly visibleCount = computed(() => this.visibleRows().length);

  ngOnInit(): void {
    this.service.findAll().subscribe({
      next: (rows) => {
        this.all.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not reach the API. Is Spring Boot running on :8080?');
        this.loading.set(false);
      }
    });
  }

  /** Clicking the active column flips direction; a new column starts ascending. */
  protected onSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortAsc.update((asc) => !asc);
    } else {
      this.sortKey.set(key);
      this.sortAsc.set(true);
    }
  }

  private compare(a: Cryptocurrency, b: Cryptocurrency, key: SortKey): number {
    const left = a[key];
    const right = b[key];

    // nulls (an unfilled price) always sort last, whichever way the column points
    if (left === null) {
      return 1;
    }
    if (right === null) {
      return -1;
    }
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    return String(left).localeCompare(String(right));
  }
}
