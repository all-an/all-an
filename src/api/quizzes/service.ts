import { transaction } from '../db/pool.js';
import { BadRequest, Forbidden, NotFound } from '../http/errors.js';
import type { SessionUser } from '../auth/session.js';
import { isQuizSharedWith } from '../shares/repo.js';
import * as repo from './repo.js';
import type { QuestionKind, QuizRow, Visibility } from './repo.js';

export interface QuizSummary {
  id: number;
  title: string;
  description: string | null;
  subject: string;
  studyField: { slug: string; name: string };
  visibility: Visibility;
  questionCount: number;
  createdAt: string;
  owned: boolean;
  /** Whether the viewer has archived this quiz. False for an anonymous viewer. */
  archived: boolean;
}

export interface QuestionDetail {
  id: number;
  position: number;
  kind: QuestionKind;
  prompt: string;
  explanation: string | null;
  timeLimitSeconds: number;
  /** Whether the owner has archived this question, so it is skipped when they take the quiz. */
  archived: boolean;
  /** Present only for the owner. For a TYPED question these are the accepted answers. */
  options: { id: number; body: string; isCorrect: boolean }[];
}

export interface QuizDetail extends QuizSummary {
  studyFieldId: number;
  defaultTimeLimitSeconds: number;
  shuffleQuestions: boolean;
  /** Present only for the owner - see readQuiz. */
  questions?: QuestionDetail[];
}

function toSummary(row: QuizRow, viewerId: string | undefined): QuizSummary {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    subject: row.subject,
    studyField: { slug: row.study_field_slug, name: row.study_field_name },
    visibility: row.visibility,
    questionCount: Number(row.question_count),
    createdAt: row.created_at.toISOString(),
    owned: row.owner_id !== null && row.owner_id === viewerId,
    archived: row.archived ?? false
  };
}

/**
 * Fetches a quiz the viewer is allowed to see, or throws.
 *
 * Three ways in: you wrote it, it is published, or somebody shared it with you. Anything else is
 * a 404, never a 403 - a 403 would confirm that a quiz with that id exists, which is precisely
 * what the owner did not publish.
 */
async function readable(id: string, viewer: SessionUser | undefined): Promise<QuizRow> {
  const row = await repo.findQuizById(id);

  if (!row) {
    throw new NotFound('No such quiz.');
  }

  if (row.visibility === 'PUBLIC') {
    return row;
  }

  if (row.owner_id !== null && row.owner_id === viewer?.id) {
    return row;
  }

  if (viewer && (await isQuizSharedWith(id, viewer.id))) {
    return row;
  }

  throw new NotFound('No such quiz.');
}

/**
 * Fetches a quiz the viewer is allowed to change, or throws.
 *
 * Seeded quizzes have no owner and are editable by nobody, administrators included - the starter
 * content is part of the deployment, not user data.
 */
async function writable(id: string, viewer: SessionUser): Promise<QuizRow> {
  const row = await repo.findQuizById(id);

  if (!row) {
    throw new NotFound('No such quiz.');
  }

  if (row.owner_id === viewer.id) {
    return row;
  }

  // An administrator may remove a published quiz from the pool - moderation. They still cannot
  // edit it, and a private quiz stays invisible to them, so this reveals nothing new.
  if (viewer.role === 'ADMIN' && row.visibility === 'PUBLIC') {
    return row;
  }

  throw new NotFound('No such quiz.');
}

export async function listOwn(
  viewer: SessionUser,
  studyField?: string,
  subject?: string,
  archived = false
): Promise<QuizSummary[]> {
  const rows = await repo.findQuizzesByOwner(viewer.id, studyField, subject, archived);
  return rows.map((row) => toSummary(row, viewer.id));
}

export async function listPublic(
  viewer: SessionUser | undefined,
  studyField?: string,
  subject?: string,
  limit?: number,
  offset?: number,
  archived = false
): Promise<QuizSummary[]> {
  const rows = await repo.findPublicQuizzes(viewer?.id ?? null, studyField, subject, limit, offset, archived);
  return rows.map((row) => toSummary(row, viewer?.id));
}

/**
 * One quiz.
 *
 * The owner gets the questions and their answers, because that is the editing view. Everybody else
 * gets the description and a question count and nothing more: shipping the questions to a
 * prospective taker would hand them the answer key before they started.
 */
export async function readQuiz(id: string, viewer: SessionUser | undefined): Promise<QuizDetail> {
  const row = await readable(id, viewer);
  const summary = toSummary(row, viewer?.id);

  const detail: QuizDetail = {
    ...summary,
    studyFieldId: row.study_field_id,
    defaultTimeLimitSeconds: row.default_time_limit_seconds,
    shuffleQuestions: row.shuffle_questions
  };

  if (!summary.owned) {
    return detail;
  }

  const questions = await repo.findQuestions(id);
  const options = await repo.findOptions(questions.map((question) => question.id));
  const archivedIds = await repo.findArchivedQuestionIds(
    row.owner_id!,
    questions.map((question) => question.id)
  );

  detail.questions = questions.map((question) => ({
    id: Number(question.id),
    position: question.position,
    kind: question.kind,
    prompt: question.prompt,
    explanation: question.explanation,
    timeLimitSeconds: question.time_limit_seconds,
    archived: archivedIds.has(question.id),
    options: options
      .filter((option) => option.question_id === question.id)
      .map((option) => ({ id: Number(option.id), body: option.body, isCorrect: option.is_correct }))
  }));

  return detail;
}

export interface QuizInput {
  title: string;
  description?: string | undefined;
  studyFieldId: number;
  subject: string;
  defaultTimeLimitSeconds: number;
  shuffleQuestions: boolean;
}

function toFields(input: QuizInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    studyFieldId: input.studyFieldId,
    subject: input.subject.trim(),
    defaultTimeLimitSeconds: input.defaultTimeLimitSeconds,
    shuffleQuestions: input.shuffleQuestions
  };
}

async function assertStudyField(id: number): Promise<void> {
  if (!(await repo.studyFieldExists(id))) {
    throw new BadRequest('That study field does not exist.', {
      fields: { studyFieldId: 'Pick a study field from the list.' }
    });
  }
}

export async function createQuiz(viewer: SessionUser, input: QuizInput): Promise<QuizDetail> {
  await assertStudyField(input.studyFieldId);

  const id = await repo.insertQuiz(viewer.id, toFields(input));
  return readQuiz(id, viewer);
}

export async function editQuiz(
  id: string,
  viewer: SessionUser,
  input: QuizInput
): Promise<QuizDetail> {
  const row = await writable(id, viewer);

  if (row.owner_id !== viewer.id) {
    throw new Forbidden('Only the author can edit a quiz.');
  }

  await assertStudyField(input.studyFieldId);
  await repo.updateQuiz(id, toFields(input));

  return readQuiz(id, viewer);
}

export async function setVisibility(
  id: string,
  viewer: SessionUser,
  visibility: Visibility
): Promise<QuizDetail> {
  const row = await writable(id, viewer);

  if (row.owner_id !== viewer.id) {
    throw new Forbidden('Only the author can publish or unpublish a quiz.');
  }

  // Publishing an empty quiz would put a dead end in the pool: it would be listed, clicked, and
  // have nothing to ask.
  if (visibility === 'PUBLIC' && Number(row.question_count) === 0) {
    throw new BadRequest('Add at least one question before publishing.');
  }

  await repo.updateQuizVisibility(id, visibility);
  return readQuiz(id, viewer);
}

export async function removeQuiz(id: string, viewer: SessionUser): Promise<void> {
  await writable(id, viewer);
  await repo.deleteQuiz(id);
}

/**
 * Archives, or unarchives, a quiz for this viewer.
 *
 * Gated on readable rather than writable: archiving is the reader saying "I have learned this",
 * which they may do to any quiz they can see - their own, a published one, or one shared with them.
 * It never changes the quiz, only what this one person's lists show.
 */
export async function setArchived(
  id: string,
  viewer: SessionUser,
  archived: boolean
): Promise<void> {
  await readable(id, viewer);

  if (archived) {
    await repo.archiveQuiz(viewer.id, id);
  } else {
    await repo.unarchiveQuiz(viewer.id, id);
  }
}

export interface QuestionInput {
  kind: QuestionKind;
  prompt: string;
  explanation?: string | undefined;
  timeLimitSeconds?: number | undefined;
  options: { body: string; isCorrect: boolean }[];
}

/**
 * Normalises and checks a question's options.
 *
 * The two kinds mean different things by the same table, so they are validated differently:
 * multiple choice needs at least two things to choose between and at least one right answer;
 * a typed question needs at least one accepted spelling, and every row is by definition correct -
 * the isCorrect flags a client sends for a TYPED question are ignored rather than trusted.
 */
function normaliseOptions(input: QuestionInput): { body: string; isCorrect: boolean }[] {
  const options = input.options
    .map((option) => ({ body: option.body.trim(), isCorrect: option.isCorrect }))
    .filter((option) => option.body.length > 0);

  if (input.kind === 'MULTIPLE_CHOICE') {
    if (options.length < 2) {
      throw new BadRequest('A multiple-choice question needs at least two choices.', {
        fields: { options: 'Add at least two choices.' }
      });
    }

    if (!options.some((option) => option.isCorrect)) {
      throw new BadRequest('Mark which choice is correct.', {
        fields: { options: 'Mark at least one choice as correct.' }
      });
    }

    return options;
  }

  if (options.length === 0) {
    throw new BadRequest('A typed question needs at least one accepted answer.', {
      fields: { options: 'Add the answer you will accept.' }
    });
  }

  return options.map((option) => ({ body: option.body, isCorrect: true }));
}

export async function addQuestion(
  quizId: string,
  viewer: SessionUser,
  input: QuestionInput
): Promise<QuizDetail> {
  const quiz = await writable(quizId, viewer);

  if (quiz.owner_id !== viewer.id) {
    throw new Forbidden('Only the author can add questions.');
  }

  const options = normaliseOptions(input);
  const timeLimit = input.timeLimitSeconds ?? quiz.default_time_limit_seconds;

  await transaction(async (client) => {
    const questionId = await repo.insertQuestion(client, quizId, {
      kind: input.kind,
      prompt: input.prompt.trim(),
      explanation: input.explanation?.trim() || null,
      timeLimitSeconds: timeLimit
    });

    await repo.replaceOptions(client, questionId, options);
  });

  return readQuiz(quizId, viewer);
}

/** Loads a question and the quiz it belongs to, checking the viewer owns that quiz. */
async function ownedQuestion(questionId: string, viewer: SessionUser) {
  const question = await repo.findQuestionById(questionId);

  if (!question) {
    throw new NotFound('No such question.');
  }

  const quiz = await repo.findQuizById(question.quiz_id);

  if (!quiz || quiz.owner_id !== viewer.id) {
    throw new NotFound('No such question.');
  }

  return { question, quiz };
}

export async function editQuestion(
  questionId: string,
  viewer: SessionUser,
  input: QuestionInput
): Promise<QuizDetail> {
  const { question, quiz } = await ownedQuestion(questionId, viewer);
  const options = normaliseOptions(input);

  await transaction(async (client) => {
    await repo.updateQuestionFields(client, questionId, {
      kind: input.kind,
      prompt: input.prompt.trim(),
      explanation: input.explanation?.trim() || null,
      timeLimitSeconds: input.timeLimitSeconds ?? quiz.default_time_limit_seconds
    });

    await repo.replaceOptions(client, questionId, options);
  });

  return readQuiz(question.quiz_id, viewer);
}

export async function removeQuestion(questionId: string, viewer: SessionUser): Promise<QuizDetail> {
  const { question } = await ownedQuestion(questionId, viewer);

  await repo.deleteQuestion(questionId);

  return readQuiz(question.quiz_id, viewer);
}

/**
 * Archives, or unarchives, a single question for this viewer.
 *
 * Like the quiz-level version this is gated on being able to read the parent quiz, not own it: a
 * learner marking a question they have mastered may do so on any quiz they can take. The archive is
 * theirs alone - the question itself, and everyone else's runs, are untouched.
 */
export async function setQuestionArchived(
  questionId: string,
  viewer: SessionUser,
  archived: boolean
): Promise<void> {
  const question = await repo.findQuestionById(questionId);

  if (!question) {
    throw new NotFound('No such question.');
  }

  // Reuses the quiz visibility rules, and 404s on a question whose quiz the viewer cannot see.
  await readable(question.quiz_id, viewer);

  if (archived) {
    await repo.archiveQuestion(viewer.id, questionId);
  } else {
    await repo.unarchiveQuestion(viewer.id, questionId);
  }
}

export async function reorder(
  quizId: string,
  viewer: SessionUser,
  questionIds: readonly number[]
): Promise<QuizDetail> {
  const quiz = await writable(quizId, viewer);

  if (quiz.owner_id !== viewer.id) {
    throw new Forbidden('Only the author can reorder questions.');
  }

  const existing = await repo.findQuestions(quizId);
  const wanted = questionIds.map(String);

  // The new order has to be a permutation of what is there. A partial list would leave questions
  // parked on the negative positions the two-pass rewrite uses, which is a corrupt quiz.
  const sameSet =
    wanted.length === existing.length &&
    new Set(wanted).size === wanted.length &&
    existing.every((question) => wanted.includes(question.id));

  if (!sameSet) {
    throw new BadRequest('The new order must list every question in the quiz exactly once.');
  }

  await transaction((client) => repo.reorderQuestions(client, quizId, wanted));

  return readQuiz(quizId, viewer);
}

export async function listStudyFields() {
  const rows = await repo.findStudyFields();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    publicQuizCount: Number(row.public_quiz_count)
  }));
}

export async function listSubjects(
  viewer: SessionUser | undefined,
  scope: 'public' | 'mine',
  studyField?: string
): Promise<string[]> {
  if (scope === 'mine' && viewer) {
    return repo.findOwnSubjects(viewer.id);
  }

  return repo.findPublicSubjects(studyField);
}
