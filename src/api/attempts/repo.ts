import type { PoolClient } from 'pg';

import { query, queryOne } from '../db/pool.js';

export interface AttemptRow {
  id: string;
  user_id: string;
  quiz_id: string | null;
  quiz_title_snapshot: string;
  started_at: Date;
  finished_at: Date | null;
  total: string;
  answered: string;
  correct: string;
}

export interface AttemptQuestionRow {
  id: string;
  attempt_id: string;
  question_id: string | null;
  prompt_snapshot: string;
  position: number;
  served_at: Date | null;
  answered_at: Date | null;
  given_text: string | null;
  given_option_id: string | null;
  is_correct: boolean | null;
  timed_out: boolean;
  elapsed_ms: number | null;
}

const ATTEMPT_SELECT = `
  SELECT a.id, a.user_id, a.quiz_id, a.quiz_title_snapshot, a.started_at, a.finished_at,
         (SELECT COUNT(*) FROM attempt_questions WHERE attempt_id = a.id) AS total,
         (SELECT COUNT(*) FROM attempt_questions
           WHERE attempt_id = a.id AND answered_at IS NOT NULL) AS answered,
         (SELECT COUNT(*) FROM attempt_questions
           WHERE attempt_id = a.id AND is_correct) AS correct
  FROM attempts a
`;

export async function findAttempt(id: string, userId: string): Promise<AttemptRow | undefined> {
  return queryOne<AttemptRow>(`${ATTEMPT_SELECT} WHERE a.id = $1 AND a.user_id = $2`, [id, userId]);
}

export async function findAttemptsFor(userId: string, limit = 50): Promise<AttemptRow[]> {
  return query<AttemptRow>(
    `${ATTEMPT_SELECT} WHERE a.user_id = $1 ORDER BY a.started_at DESC LIMIT $2`,
    [userId, limit]
  );
}

export async function insertAttempt(
  client: PoolClient,
  userId: string,
  quizId: string,
  quizTitle: string
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO attempts (user_id, quiz_id, quiz_title_snapshot) VALUES ($1, $2, $3) RETURNING id`,
    [userId, quizId, quizTitle]
  );

  return rows[0]!.id;
}

export async function insertAttemptQuestion(
  client: PoolClient,
  attemptId: string,
  questionId: string,
  prompt: string,
  position: number
): Promise<void> {
  await client.query(
    `INSERT INTO attempt_questions (attempt_id, question_id, prompt_snapshot, position)
     VALUES ($1, $2, $3, $4)`,
    [attemptId, questionId, prompt, position]
  );
}

/** The next question that has not been answered, in order. */
export async function findNextUnanswered(
  attemptId: string
): Promise<AttemptQuestionRow | undefined> {
  return queryOne<AttemptQuestionRow>(
    `SELECT * FROM attempt_questions
     WHERE attempt_id = $1 AND answered_at IS NULL
     ORDER BY position LIMIT 1`,
    [attemptId]
  );
}

export async function findAttemptQuestions(attemptId: string): Promise<AttemptQuestionRow[]> {
  return query<AttemptQuestionRow>(
    'SELECT * FROM attempt_questions WHERE attempt_id = $1 ORDER BY position',
    [attemptId]
  );
}

/**
 * Stamps served_at the first time a question is handed out, and returns whatever it now holds.
 *
 * The COALESCE is what makes a refresh honest: asking for the same question again does not restart
 * its clock, it returns the moment it was first served.
 */
export async function stampServed(id: string): Promise<Date> {
  const row = await queryOne<{ served_at: Date }>(
    `UPDATE attempt_questions SET served_at = COALESCE(served_at, NOW())
     WHERE id = $1 RETURNING served_at`,
    [id]
  );

  return row!.served_at;
}

export async function recordAnswer(
  id: string,
  answer: {
    givenText: string | null;
    givenOptionId: string | null;
    isCorrect: boolean;
    timedOut: boolean;
    elapsedMs: number;
  }
): Promise<void> {
  await query(
    `UPDATE attempt_questions
     SET answered_at = NOW(), given_text = $2, given_option_id = $3,
         is_correct = $4, timed_out = $5, elapsed_ms = $6
     WHERE id = $1`,
    [
      id,
      answer.givenText,
      answer.givenOptionId,
      answer.isCorrect,
      answer.timedOut,
      answer.elapsedMs
    ]
  );
}

export async function finishAttempt(id: string): Promise<void> {
  await query('UPDATE attempts SET finished_at = NOW() WHERE id = $1 AND finished_at IS NULL', [id]);
}

/**
 * Removes an attempt and its questions, but only if it belongs to this user.
 *
 * Scoped by user_id in the statement itself rather than checked first and deleted second, so there
 * is no window between the two and no way to delete someone else's history. attempt_questions goes
 * with it through ON DELETE CASCADE.
 */
export async function deleteAttempt(id: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM attempts WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );

  return rows.length > 0;
}

/** Whether every question in the attempt has been answered. */
export async function isComplete(attemptId: string): Promise<boolean> {
  const row = await queryOne<{ remaining: string }>(
    'SELECT COUNT(*) AS remaining FROM attempt_questions WHERE attempt_id = $1 AND answered_at IS NULL',
    [attemptId]
  );

  return Number(row?.remaining ?? 0) === 0;
}
