/**
 * How close a typed answer has to be to count.
 *
 * Someone who types "Bought." when the answer is "bought" knows the answer. Marking that wrong
 * teaches them that the quiz is unreliable, and they stop trusting the score - which is the whole
 * value of taking it. So the comparison ignores differences that carry no meaning:
 *
 *   - leading and trailing space, and runs of space inside
 *   - case
 *   - curly quotes and apostrophes, which phones insert without being asked
 *   - a trailing full stop, question mark or exclamation mark
 *   - surrounding quotation marks
 *
 * It deliberately does not ignore spelling, accents or word order. Those change the answer, and a
 * language quiz that accepted them would be teaching the wrong thing.
 */
export function normaliseTypedAnswer(value: string): string {
  return value
    .normalize('NFC')
    // Curly punctuation to its plain equivalent, before anything else looks at the string.
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** True when the typed answer matches any of the accepted spellings. */
export function gradeTyped(given: string, accepted: readonly string[]): boolean {
  const normalised = normaliseTypedAnswer(given);

  if (normalised === '') {
    return false;
  }

  return accepted.some((answer) => normaliseTypedAnswer(answer) === normalised);
}

/**
 * True when the chosen option belongs to this question and is a correct one.
 *
 * The option has to be checked for membership, not just for correctness: without that, a client
 * could send the id of a correct option belonging to some other question entirely.
 */
export function gradeMultipleChoice(
  givenOptionId: string | null,
  options: readonly { id: string; is_correct: boolean }[]
): boolean {
  if (givenOptionId === null) {
    return false;
  }

  const chosen = options.find((option) => option.id === givenOptionId);

  return chosen?.is_correct ?? false;
}

/**
 * Grace on top of the question's limit before an answer counts as late.
 *
 * The clock starts when the server hands the question out, so the network delay on the way there
 * and back is inside the measurement but outside the taker's control. Two seconds covers that
 * without being enough time to look anything up.
 */
export const TIMER_GRACE_MS = 2000;

export function isTimedOut(elapsedMs: number, timeLimitSeconds: number): boolean {
  return elapsedMs > timeLimitSeconds * 1000 + TIMER_GRACE_MS;
}
