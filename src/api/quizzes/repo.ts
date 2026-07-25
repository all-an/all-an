import type { PoolClient } from 'pg';

import { query, queryOne } from '../db/pool.js';

export type QuestionKind = 'MULTIPLE_CHOICE' | 'TYPED';
export type Visibility = 'PRIVATE' | 'PUBLIC';

export interface QuizRow {
  id: string;
  owner_id: string | null;
  title: string;
  description: string | null;
  study_field_id: number;
  study_field_slug: string;
  study_field_name: string;
  subject: string;
  visibility: Visibility;
  default_time_limit_seconds: number;
  shuffle_questions: boolean;
  created_at: Date;
  question_count: string;
  /** Whether the viewer has archived this quiz. Absent (undefined) on reads that have no viewer. */
  archived?: boolean;
}

export interface QuestionRow {
  id: string;
  quiz_id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  explanation: string | null;
  time_limit_seconds: number;
}

export interface OptionRow {
  id: string;
  question_id: string;
  position: number;
  body: string;
  is_correct: boolean;
}

/** The columns every quiz read needs, with the field joined and the questions counted. */
const QUIZ_SELECT = `
  SELECT q.id, q.owner_id, q.title, q.description, q.study_field_id,
         f.slug AS study_field_slug, f.name AS study_field_name,
         q.subject, q.visibility, q.default_time_limit_seconds, q.shuffle_questions, q.created_at,
         (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count
  FROM quizzes q
  JOIN study_fields f ON f.id = q.study_field_id
`;

/**
 * The same, plus whether the given viewer has archived each quiz.
 *
 * $1 is always the viewer id (possibly NULL for an anonymous browser, in which case nothing is ever
 * archived). Later parameters follow, so every caller of this select starts its own bindings at $2.
 */
const QUIZ_SELECT_WITH_ARCHIVE = `
  SELECT q.id, q.owner_id, q.title, q.description, q.study_field_id,
         f.slug AS study_field_slug, f.name AS study_field_name,
         q.subject, q.visibility, q.default_time_limit_seconds, q.shuffle_questions, q.created_at,
         (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count,
         EXISTS (SELECT 1 FROM quiz_archives za WHERE za.quiz_id = q.id AND za.user_id = $1) AS archived
  FROM quizzes q
  JOIN study_fields f ON f.id = q.study_field_id
`;

export async function findQuizById(id: string): Promise<QuizRow | undefined> {
  return queryOne<QuizRow>(`${QUIZ_SELECT} WHERE q.id = $1`, [id]);
}

export async function findQuizzesByOwner(
  ownerId: string,
  studyFieldSlug?: string,
  subject?: string,
  archived = false
): Promise<QuizRow[]> {
  return query<QuizRow>(
    `${QUIZ_SELECT_WITH_ARCHIVE}
     WHERE q.owner_id = $1
       AND ($2::text IS NULL OR f.slug = $2)
       AND ($3::text IS NULL OR q.subject = $3)
       AND EXISTS (SELECT 1 FROM quiz_archives za WHERE za.quiz_id = q.id AND za.user_id = $1) = $4
     ORDER BY q.created_at DESC`,
    [ownerId, studyFieldSlug ?? null, subject ?? null, archived]
  );
}

/**
 * The shared pool.
 *
 * Quizzes with no questions are excluded: an empty quiz cannot be taken, so listing it only
 * produces a dead end for whoever clicks it. The viewer, when signed in, also never sees the
 * quizzes they have archived here - those move to their archived view instead.
 */
export async function findPublicQuizzes(
  viewerId: string | null,
  studyFieldSlug?: string,
  subject?: string,
  limit = 50,
  offset = 0,
  archived = false
): Promise<QuizRow[]> {
  return query<QuizRow>(
    `${QUIZ_SELECT_WITH_ARCHIVE}
     WHERE q.visibility = 'PUBLIC'
       AND ($2::text IS NULL OR f.slug = $2)
       AND ($3::text IS NULL OR q.subject = $3)
       AND EXISTS (SELECT 1 FROM questions WHERE quiz_id = q.id)
       AND EXISTS (SELECT 1 FROM quiz_archives za WHERE za.quiz_id = q.id AND za.user_id = $1) = $6
     ORDER BY q.created_at DESC
     LIMIT $4 OFFSET $5`,
    [viewerId, studyFieldSlug ?? null, subject ?? null, limit, offset, archived]
  );
}

export async function insertQuiz(
  ownerId: string,
  fields: {
    title: string;
    description: string | null;
    studyFieldId: number;
    subject: string;
    defaultTimeLimitSeconds: number;
    shuffleQuestions: boolean;
  }
): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO quizzes
       (owner_id, title, description, study_field_id, subject,
        default_time_limit_seconds, shuffle_questions)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      ownerId,
      fields.title,
      fields.description,
      fields.studyFieldId,
      fields.subject,
      fields.defaultTimeLimitSeconds,
      fields.shuffleQuestions
    ]
  );

  return rows[0]!.id;
}

export async function updateQuiz(
  id: string,
  fields: {
    title: string;
    description: string | null;
    studyFieldId: number;
    subject: string;
    defaultTimeLimitSeconds: number;
    shuffleQuestions: boolean;
  }
): Promise<void> {
  await query(
    `UPDATE quizzes
     SET title = $2, description = $3, study_field_id = $4, subject = $5,
         default_time_limit_seconds = $6, shuffle_questions = $7, updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      fields.title,
      fields.description,
      fields.studyFieldId,
      fields.subject,
      fields.defaultTimeLimitSeconds,
      fields.shuffleQuestions
    ]
  );
}

export async function updateQuizVisibility(id: string, visibility: Visibility): Promise<void> {
  await query('UPDATE quizzes SET visibility = $2, updated_at = NOW() WHERE id = $1', [
    id,
    visibility
  ]);
}

export async function deleteQuiz(id: string): Promise<void> {
  await query('DELETE FROM quizzes WHERE id = $1', [id]);
}

export async function findQuestions(quizId: string): Promise<QuestionRow[]> {
  return query<QuestionRow>(
    `SELECT id, quiz_id, position, kind, prompt, explanation, time_limit_seconds
     FROM questions WHERE quiz_id = $1 ORDER BY position`,
    [quizId]
  );
}

export async function findQuestionById(id: string): Promise<QuestionRow | undefined> {
  return queryOne<QuestionRow>(
    `SELECT id, quiz_id, position, kind, prompt, explanation, time_limit_seconds
     FROM questions WHERE id = $1`,
    [id]
  );
}

export async function findOptions(questionIds: readonly string[]): Promise<OptionRow[]> {
  if (questionIds.length === 0) {
    return [];
  }

  return query<OptionRow>(
    `SELECT id, question_id, position, body, is_correct
     FROM question_options WHERE question_id = ANY($1::bigint[]) ORDER BY question_id, position`,
    [questionIds]
  );
}

export async function insertQuestion(
  client: PoolClient,
  quizId: string,
  fields: {
    kind: QuestionKind;
    prompt: string;
    explanation: string | null;
    timeLimitSeconds: number;
  }
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO questions (quiz_id, position, kind, prompt, explanation, time_limit_seconds)
     VALUES ($1, COALESCE((SELECT MAX(position) + 1 FROM questions WHERE quiz_id = $1), 1),
             $2, $3, $4, $5)
     RETURNING id`,
    [quizId, fields.kind, fields.prompt, fields.explanation, fields.timeLimitSeconds]
  );

  return rows[0]!.id;
}

export async function updateQuestionFields(
  client: PoolClient,
  id: string,
  fields: {
    kind: QuestionKind;
    prompt: string;
    explanation: string | null;
    timeLimitSeconds: number;
  }
): Promise<void> {
  await client.query(
    `UPDATE questions SET kind = $2, prompt = $3, explanation = $4, time_limit_seconds = $5
     WHERE id = $1`,
    [id, fields.kind, fields.prompt, fields.explanation, fields.timeLimitSeconds]
  );
}

export async function replaceOptions(
  client: PoolClient,
  questionId: string,
  options: readonly { body: string; isCorrect: boolean }[]
): Promise<void> {
  await client.query('DELETE FROM question_options WHERE question_id = $1', [questionId]);

  for (const [index, option] of options.entries()) {
    await client.query(
      'INSERT INTO question_options (question_id, position, body, is_correct) VALUES ($1, $2, $3, $4)',
      [questionId, index + 1, option.body, option.isCorrect]
    );
  }
}

export async function deleteQuestion(id: string): Promise<void> {
  await query('DELETE FROM questions WHERE id = $1', [id]);
}

// --- per-user archiving -----------------------------------------------------

/** Idempotent: archiving an already-archived quiz is a no-op, not a duplicate row. */
export async function archiveQuiz(userId: string, quizId: string): Promise<void> {
  await query(
    `INSERT INTO quiz_archives (user_id, quiz_id) VALUES ($1, $2)
     ON CONFLICT (user_id, quiz_id) DO NOTHING`,
    [userId, quizId]
  );
}

export async function unarchiveQuiz(userId: string, quizId: string): Promise<void> {
  await query('DELETE FROM quiz_archives WHERE user_id = $1 AND quiz_id = $2', [userId, quizId]);
}

export async function archiveQuestion(userId: string, questionId: string): Promise<void> {
  await query(
    `INSERT INTO question_archives (user_id, question_id) VALUES ($1, $2)
     ON CONFLICT (user_id, question_id) DO NOTHING`,
    [userId, questionId]
  );
}

export async function unarchiveQuestion(userId: string, questionId: string): Promise<void> {
  await query('DELETE FROM question_archives WHERE user_id = $1 AND question_id = $2', [
    userId,
    questionId
  ]);
}

/** Which of the given questions this user has archived, as a set of question ids. */
export async function findArchivedQuestionIds(
  userId: string,
  questionIds: readonly string[]
): Promise<Set<string>> {
  if (questionIds.length === 0) {
    return new Set();
  }

  const rows = await query<{ question_id: string }>(
    `SELECT question_id FROM question_archives
     WHERE user_id = $1 AND question_id = ANY($2::bigint[])`,
    [userId, questionIds]
  );

  return new Set(rows.map((row) => row.question_id));
}

/**
 * Rewrites question positions to the given order.
 *
 * Done in two passes because (quiz_id, position) is unique: assigning the new numbers directly
 * would collide with the rows still holding them. The first pass parks everything on negative
 * positions, which nothing else can occupy, and the second lands them.
 */
export async function reorderQuestions(
  client: PoolClient,
  quizId: string,
  questionIds: readonly string[]
): Promise<void> {
  for (const [index, id] of questionIds.entries()) {
    await client.query(
      'UPDATE questions SET position = $3 WHERE id = $1 AND quiz_id = $2',
      [id, quizId, -(index + 1)]
    );
  }

  await client.query(
    'UPDATE questions SET position = -position WHERE quiz_id = $1 AND position < 0',
    [quizId]
  );
}

export interface StudyFieldRow {
  id: number;
  slug: string;
  name: string;
  public_quiz_count: string;
}

export async function findStudyFields(): Promise<StudyFieldRow[]> {
  return query<StudyFieldRow>(
    `SELECT f.id, f.slug, f.name,
            COUNT(q.id) FILTER (
              WHERE q.visibility = 'PUBLIC'
                AND EXISTS (SELECT 1 FROM questions WHERE quiz_id = q.id)
            ) AS public_quiz_count
     FROM study_fields f
     LEFT JOIN quizzes q ON q.study_field_id = f.id
     GROUP BY f.id, f.slug, f.name, f.position
     ORDER BY f.position`
  );
}

export async function findStudyFieldBySlug(slug: string): Promise<{ id: number } | undefined> {
  return queryOne<{ id: number }>('SELECT id FROM study_fields WHERE slug = $1', [slug]);
}

export async function studyFieldExists(id: number): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM study_fields WHERE id = $1) AS exists',
    [id]
  );

  return row?.exists ?? false;
}

/**
 * Subjects in use in the public pool.
 *
 * Restricted to PUBLIC on purpose: a filter list built from every row would disclose the subjects
 * of everybody's unpublished drafts to anyone who opened the browse page.
 */
export async function findPublicSubjects(studyFieldSlug?: string): Promise<string[]> {
  const rows = await query<{ subject: string }>(
    `SELECT DISTINCT q.subject
     FROM quizzes q
     JOIN study_fields f ON f.id = q.study_field_id
     WHERE q.visibility = 'PUBLIC'
       AND ($1::text IS NULL OR f.slug = $1)
       AND EXISTS (SELECT 1 FROM questions WHERE quiz_id = q.id)
     ORDER BY q.subject`,
    [studyFieldSlug ?? null]
  );

  return rows.map((row) => row.subject);
}

/** Subjects this owner has already used, to populate the datalist on the editor. */
export async function findOwnSubjects(ownerId: string): Promise<string[]> {
  const rows = await query<{ subject: string }>(
    'SELECT DISTINCT subject FROM quizzes WHERE owner_id = $1 ORDER BY subject',
    [ownerId]
  );

  return rows.map((row) => row.subject);
}
