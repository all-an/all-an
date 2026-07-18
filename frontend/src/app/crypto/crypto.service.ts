import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type PrivacyLevel = 'MANDATORY' | 'OPTIONAL' | 'NONE';
export type Fungibility = 'STRONG' | 'PARTIAL' | 'NONE';

export interface Cryptocurrency {
  rank: number;
  name: string;
  symbol: string;
  websiteUrl: string;

  privacy: PrivacyLevel;
  privacyKind: string;
  privacyByDefault: boolean;
  anonymitySet: string;
  trustedSetupRequired: boolean;
  fungibility: Fungibility;

  mempoolTimeSeconds: number;
  transactionTimeSeconds: number;
  transactionFeeUsd: number;
  blockTimeSeconds: number;
  consensus: string;
  launchYear: number;
  supplyCap: number | null;
  smartContracts: boolean;

  priceUsd: number | null;
  priceDate: string | null;
  priceUpdatedAt: string | null;

  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class CryptoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/cryptocurrencies';

  findAll(): Observable<Cryptocurrency[]> {
    return this.http.get<Cryptocurrency[]>(this.baseUrl);
  }
}
