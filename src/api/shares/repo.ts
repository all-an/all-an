import { query, queryOne } from '../db/pool.js';

export interface QuizShareRow {
  id: string;
  quiz_id: string;
  quiz_title: string;
  quiz_subject: string;
  study_field_name: string;
  question_count: string;
  shared_by_username: string;
  created_at: Date;
}

export interface QuestionShareRow {
  id: string;
  question_id: string | null;
  prompt: string;
  kind: 'MULTIPLE_CHOICE' | 'TYPED';
  time_limit_seconds: number;
  shared_by_username: string;
  created_at: Date;
  copied_at: Date | null;
}

export async function shareQuiz(
  quizId: string,
  sharedById: string,
  sharedWithId: string
): Promise<boolean> {
  // Sharing the same quiz with the same person twice is one share, not a second notification.
  // The DO NOTHING makes that idempotent, and the row count tells the caller whether this was new
  // - which is what decides if an email goes out.
  const rows = await query<{ id: string }>(
    `INSERT INTO quiz_shares (quiz_id, shared_by_id, shared_with_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (quiz_id, shared_with_id) DO NOTHING
     RETURNING id`,
    [quizId, sharedById, sharedWithId]
  );

  return rows.length > 0;
}

export async function shareQuestion(
  questionId: string,
  sharedById: string,
  sharedWithId: string
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO question_shares (question_id, shared_by_id, shared_with_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (question_id, shared_with_id) DO NOTHING
     RETURNING id`,
    [questionId, sharedById, sharedWithId]
  );

  return rows.length > 0;
}

export async function findQuizSharesFor(userId: string): Promise<QuizShareRow[]> {
  return query<QuizShareRow>(
    `SELECT s.id, s.quiz_id, q.title AS quiz_title, q.subject AS quiz_subject,
            f.name AS study_field_name, sender.username AS shared_by_username, s.created_at,
            (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count
     FROM quiz_shares s
     JOIN quizzes q ON q.id = s.quiz_id
     JOIN study_fields f ON f.id = q.study_field_id
     JOIN users sender ON sender.id = s.shared_by_id
     WHERE s.shared_with_id = $1 AND s.dismissed_at IS NULL
     ORDER BY s.created_at DESC`,
    [userId]
  );
}

export async function findQuestionSharesFor(userId: string): Promise<QuestionShareRow[]> {
  return query<QuestionShareRow>(
    `SELECT s.id, s.question_id, q.prompt, q.kind, q.time_limit_seconds,
            sender.username AS shared_by_username, s.created_at, s.copied_at
     FROM question_shares s
     JOIN questions q ON q.id = s.question_id
     JOIN users sender ON sender.id = s.shared_by_id
     WHERE s.shared_with_id = $1 AND s.dismissed_at IS NULL
     ORDER BY s.created_at DESC`,
    [userId]
  );
}

/** Whether this quiz has been shared with this person - the read-access check. */
export async function isQuizSharedWith(quizId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM quiz_shares WHERE quiz_id = $1 AND shared_with_id = $2) AS exists',
    [quizId, userId]
  );

  return row?.exists ?? false;
}

export async function findQuestionShare(
  id: string,
  userId: string
): Promise<{ id: string; question_id: string; copied_at: Date | null } | undefined> {
  return queryOne(
    `SELECT id, question_id, copied_at FROM question_shares
     WHERE id = $1 AND shared_with_id = $2`,
    [id, userId]
  );
}

export async function markCopied(id: string): Promise<void> {
  await query('UPDATE question_shares SET copied_at = NOW() WHERE id = $1', [id]);
}

export async function dismissQuizShare(id: string, userId: string): Promise<void> {
  await query(
    'UPDATE quiz_shares SET dismissed_at = NOW() WHERE id = $1 AND shared_with_id = $2',
    [id, userId]
  );
}

export async function dismissQuestionShare(id: string, userId: string): Promise<void> {
  await query(
    'UPDATE question_shares SET dismissed_at = NOW() WHERE id = $1 AND shared_with_id = $2',
    [id, userId]
  );
}
