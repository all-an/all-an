import { Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { Cryptocurrency } from '../crypto.service';
import { PrivacyBadge } from '../privacy-badge/privacy-badge';

export type SortKey =
  | 'rank'
  | 'name'
  | 'privacy'
  | 'mempoolTimeSeconds'
  | 'transactionTimeSeconds'
  | 'transactionFeeUsd'
  | 'launchYear'
  | 'priceUsd';

/**
 * Presentational: takes rows, emits sort intent, owns no state of its own. The dashboard decides
 * what the rows are; this only draws them.
 */
@Component({
  selector: 'app-crypto-table',
  imports: [DecimalPipe, PrivacyBadge],
  templateUrl: './crypto-table.html',
  styleUrl: './crypto-table.css'
})
export class CryptoTable {
  readonly rows = input.required<Cryptocurrency[]>();
  readonly sortKey = input.required<SortKey>();
  readonly sortAsc = input.required<boolean>();

  readonly sortChange = output<SortKey>();

  protected readonly columns: ReadonlyArray<{ key: SortKey; label: string }> = [
    { key: 'rank', label: '#' },
    { key: 'name', label: 'Name' },
    { key: 'privacy', label: 'Privacy' },
    { key: 'mempoolTimeSeconds', label: 'Mempool time' },
    { key: 'transactionTimeSeconds', label: 'Tx time' },
    { key: 'transactionFeeUsd', label: 'Tx fee' },
    { key: 'launchYear', label: 'Since' },
    { key: 'priceUsd', label: 'Price' }
  ];

  protected onSort(key: SortKey): void {
    this.sortChange.emit(key);
  }

  /** Seconds are unreadable past a minute or two; humanise without lying about precision. */
  protected humaniseSeconds(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.round(seconds / 60);
    return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;
  }
}
