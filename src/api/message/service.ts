import { TooManyRequests } from '../http/errors.js';
import { hasPostedSince, insertMessage, type MessageRow } from './repo.js';

/** Shown in the 429 body so the sender always has a way through. */
export const CONTACT_EMAIL = 'allan8tech@gmail.com';

export interface CreateMessage {
  name?: string | undefined;
  email?: string | undefined;
  body: string;
}

/**
 * "One a day" is measured against the UTC calendar day, not a rolling 24 hours. A rolling window
 * punishes someone who writes at 09:00 and again at 08:00 the next morning, which reads as broken
 * to them; a calendar day resets at a predictable moment. UTC rather than server local time so the
 * reset does not move when the host or its timezone changes.
 */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** An empty optional field is absent, not an empty string - keep that out of the database. */
export function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function send(request: CreateMessage, ip: string): Promise<MessageRow> {
  if (await hasPostedSince(ip, startOfTodayUtc())) {
    throw new TooManyRequests('This address has already sent a message today.', {
      // The address travels in the body so the UI never has to hardcode a copy of it.
      contactEmail: CONTACT_EMAIL
    });
  }

  return insertMessage(
    ip,
    blankToNull(request.name),
    blankToNull(request.email),
    request.body.trim()
  );
}
