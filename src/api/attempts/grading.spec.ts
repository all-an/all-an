import { describe, expect, it } from 'vitest';

import {
  gradeMultipleChoice,
  gradeTyped,
  isTimedOut,
  normaliseTypedAnswer,
  TIMER_GRACE_MS
} from './grading.js';

describe('normaliseTypedAnswer', () => {
  it('ignores case and surrounding space', () => {
    expect(normaliseTypedAnswer('  Bought  ')).toBe('bought');
  });

  it('ignores a trailing full stop, question mark or exclamation mark', () => {
    expect(normaliseTypedAnswer('bought.')).toBe('bought');
    expect(normaliseTypedAnswer('bought?')).toBe('bought');
    expect(normaliseTypedAnswer('bought!!')).toBe('bought');
  });

  it('collapses runs of space inside the answer', () => {
    expect(normaliseTypedAnswer('have   lived')).toBe('have lived');
  });

  it('treats a curly apostrophe as a plain one, because phones insert them unasked', () => {
    expect(normaliseTypedAnswer('it’s')).toBe(normaliseTypedAnswer("it's"));
  });

  it('strips surrounding quotation marks', () => {
    expect(normaliseTypedAnswer('"Ottawa"')).toBe('ottawa');
    expect(normaliseTypedAnswer('“Ottawa”')).toBe('ottawa');
  });

  it('keeps differences that change the answer', () => {
    // Spelling, accents and word order are all meaningful in a language quiz.
    expect(normaliseTypedAnswer('bougth')).not.toBe('bought');
    expect(normaliseTypedAnswer('Brasília')).not.toBe('brasilia');
    expect(normaliseTypedAnswer('lived have')).not.toBe('have lived');
  });
});

describe('gradeTyped', () => {
  it('accepts any of the listed spellings', () => {
    expect(gradeTyped('Bought.', ['bought'])).toBe(true);
    expect(gradeTyped('brasilia', ['Brasilia', 'Brasília'])).toBe(true);
    expect(gradeTyped('Brasília', ['Brasilia', 'Brasília'])).toBe(true);
  });

  it('rejects a wrong answer', () => {
    expect(gradeTyped('buyed', ['bought'])).toBe(false);
  });

  it('rejects an empty answer even when an accepted answer is somehow blank', () => {
    // Guards the case where a blank option slipped past validation: running out of time and
    // submitting nothing must never score as correct.
    expect(gradeTyped('', ['bought'])).toBe(false);
    expect(gradeTyped('   ', [''])).toBe(false);
  });
});

describe('gradeMultipleChoice', () => {
  const options = [
    { id: '1', is_correct: false },
    { id: '2', is_correct: true }
  ];

  it('accepts the correct option', () => {
    expect(gradeMultipleChoice('2', options)).toBe(true);
  });

  it('rejects an incorrect option', () => {
    expect(gradeMultipleChoice('1', options)).toBe(false);
  });

  it('rejects no answer at all', () => {
    expect(gradeMultipleChoice(null, options)).toBe(false);
  });

  it('rejects an option belonging to a different question', () => {
    // The membership check is the point: without it, sending the id of any correct option
    // anywhere in the database would score a point.
    expect(gradeMultipleChoice('99', options)).toBe(false);
  });
});

describe('isTimedOut', () => {
  it('allows an answer inside the limit', () => {
    expect(isTimedOut(4_000, 5)).toBe(false);
  });

  it('allows an answer inside the grace period', () => {
    expect(isTimedOut(5_000 + TIMER_GRACE_MS - 1, 5)).toBe(false);
  });

  it('rejects an answer past the limit and the grace', () => {
    expect(isTimedOut(5_000 + TIMER_GRACE_MS + 1, 5)).toBe(true);
    expect(isTimedOut(9_000, 5)).toBe(true);
  });
});
