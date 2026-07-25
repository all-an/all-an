import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AttemptResult, AttemptService } from '../attempt.service.js';

@Component({
  selector: 'app-results',
  imports: [RouterLink],
  templateUrl: './results.html',
  styleUrls: ['../../shared/page.css', './results.css']
})
export class Results {
  private readonly attempts = inject(AttemptService);
  private readonly route = inject(ActivatedRoute);

  protected readonly attempt = signal<AttemptResult | null>(null);
  protected readonly loading = signal(true);

  protected readonly percent = computed(() => {
    const result = this.attempt();

    if (!result || result.total === 0) {
      return 0;
    }

    return Math.round((result.correct / result.total) * 100);
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    this.attempts.result(id).subscribe((result) => {
      this.attempt.set(result);
      this.loading.set(false);
    });
  }

  /** Seconds to one decimal - "12.4s" reads better than 12400 milliseconds. */
  protected seconds(ms: number | null): string {
    return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
  }
}
