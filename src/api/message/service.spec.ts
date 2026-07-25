import { describe, expect, it } from 'vitest';

import { blankToNull, startOfTodayUtc } from './service.js';

describe('startOfTodayUtc', () => {
  it('returns midnight UTC for the given moment', () => {
    const start = startOfTodayUtc(new Date('2026-07-24T15:43:12.000Z'));
    expect(start.toISOString()).toBe('2026-07-24T00:00:00.000Z');
  });

  it('is a calendar day, not a rolling 24 hours', () => {
    // Someone who writes at 09:00 and again at 08:00 the next morning is inside 24 hours but on
    // two different days, and the limit must let the second message through.
    const monday = startOfTodayUtc(new Date('2026-07-20T09:00:00.000Z'));
    const tuesday = startOfTodayUtc(new Date('2026-07-21T08:00:00.000Z'));

    expect(monday.getTime()).not.toBe(tuesday.getTime());
  });

  it('resets at UTC midnight regardless of the host timezone', () => {
    // 23:30 in New York is already the next day in UTC; the window must follow UTC so the reset
    // does not move when the host or its timezone changes.
    const start = startOfTodayUtc(new Date('2026-07-24T03:30:00.000Z'));
    expect(start.toISOString()).toBe('2026-07-24T00:00:00.000Z');
  });
});

describe('blankToNull', () => {
  it('keeps a real value, trimmed', () => {
    expect(blankToNull('  Allan  ')).toBe('Allan');
  });

  it('turns absent and whitespace-only into null', () => {
    // An empty optional field is absent, not an empty string - that distinction belongs in the
    // database, not in the display code that would otherwise have to handle both.
    expect(blankToNull(undefined)).toBeNull();
    expect(blankToNull('')).toBeNull();
    expect(blankToNull('   ')).toBeNull();
  });
});
