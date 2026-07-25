import type { SessionUser } from '../auth/session.js';
import { transaction } from '../db/pool.js';
import { BadRequest, NotFound } from '../http/errors.js';
import * as quizRepo from '../quizzes/repo.js';
import { isQuizSharedWith } from '../shares/repo.js';
import { gradeMultipleChoice, gradeTyped, isTimedOut } from './grading.js';
import * as repo from './repo.js';

export interface AttemptSummary {
  id: number;
  quizId: number | null;
  quizTitle: string;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  answered: number;
  correct: number;
}

/**
 * A question as the taker is allowed to see it.
 *
 * Note what is absent: no is_correct on the options, and for a TYPED question no options at all.
 * This is the shape the whole feature rests on - a quiz that ships its answer key to the browser
 * is a quiz nobody has any reason to take honestly.
 */
export interface CurrentQuestion {
  attemptQuestionId: number;
  /** The underlying question, so the taker can archive it ("I've learned this") mid-run. */
  questionId: number;
  position: number;
  total: number;
  prompt: string;
  kind: quizRepo.QuestionKind;
  options?: { id: number; body: string }[];
  timeLimitSeconds: number;
  remainingMs: number;
}

export interface AnswerResult {
  correct: boolean;
  timedOut: boolean;
  correctAnswer: string;
  explanation: string | null;
  finished: boolean;
}

function toSummary(row: repo.AttemptRow): AttemptSummary {
  return {
    id: Number(row.id),
    quizId: row.quiz_id === null ? null : Number(row.quiz_id),
    quizTitle: row.quiz_title_snapshot,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    total: Number(row.total),
    answered: Number(row.answered),
    correct: Number(row.correct)
  };
}

/** Shuffles a copy. Fisher-Yates, so every ordering is equally likely. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }

  return copy;
}

/**
 * Starts an attempt at a quiz the viewer may take: their own, a published one, or one shared with
 * them.
 *
 * The questions are copied into the attempt rather than joined to live. Editing the quiz in one
 * tab must not change what is being asked in another, and a question deleted next week must not
 * rewrite what was answered today.
 */
export async function start(viewer: SessionUser, quizId: string): Promise<{ attemptId: number; total: number }> {
  const quiz = await quizRepo.findQuizById(quizId);

  if (!quiz) {
    throw new NotFound('No such quiz.');
  }

  const mayTake =
    quiz.visibility === 'PUBLIC' ||
    quiz.owner_id === viewer.id ||
    (await isQuizSharedWith(quizId, viewer.id));

  if (!mayTake) {
    throw new NotFound('No such quiz.');
  }

  const questions = await quizRepo.findQuestions(quizId);

  if (questions.length === 0) {
    throw new BadRequest('That quiz has no questions yet.');
  }

  // Questions this viewer has archived ("already learned") are left out of the run. If they have
  // archived every one, there is nothing to ask - say so rather than starting an empty attempt.
  const archived = await quizRepo.findArchivedQuestionIds(
    viewer.id,
    questions.map((question) => question.id)
  );
  const remaining = questions.filter((question) => !archived.has(question.id));

  if (remaining.length === 0) {
    throw new BadRequest(
      'You have archived every question in this quiz. Unarchive one to take it again.'
    );
  }

  const ordered = quiz.shuffle_questions ? shuffled(remaining) : remaining;

  const attemptId = await transaction(async (client) => {
    const id = await repo.insertAttempt(client, viewer.id, quizId, quiz.title);

    for (const [index, question] of ordered.entries()) {
      await repo.insertAttemptQuestion(client, id, question.id, question.prompt, index + 1);
    }

    return id;
  });

  return { attemptId: Number(attemptId), total: ordered.length };
}

async function ownedAttempt(id: string, viewer: SessionUser): Promise<repo.AttemptRow> {
  const attempt = await repo.findAttempt(id, viewer.id);

  if (!attempt) {
    throw new NotFound('No such attempt.');
  }

  return attempt;
}

/**
 * The next unanswered question, with the clock started.
 *
 * remainingMs is computed from served_at rather than sent as a fresh full allowance, so reloading
 * mid-question resumes the countdown where it was instead of handing out more time.
 */
export async function current(
  id: string,
  viewer: SessionUser
): Promise<CurrentQuestion | { finished: true }> {
  const attempt = await ownedAttempt(id, viewer);
  const next = await repo.findNextUnanswered(id);

  if (!next) {
    await repo.finishAttempt(id);
    return { finished: true };
  }

  if (next.question_id === null) {
    // The underlying question was deleted mid-attempt. Nothing can be asked, so record it as
    // unanswered-and-wrong and move on rather than dead-ending the run.
    await repo.recordAnswer(next.id, {
      givenText: null,
      givenOptionId: null,
      isCorrect: false,
      timedOut: false,
      elapsedMs: 0
    });

    return current(id, viewer);
  }

  const question = await quizRepo.findQuestionById(next.question_id);

  if (!question) {
    await repo.recordAnswer(next.id, {
      givenText: null,
      givenOptionId: null,
      isCorrect: false,
      timedOut: false,
      elapsedMs: 0
    });

    return current(id, viewer);
  }

  const servedAt = await repo.stampServed(next.id);
  const elapsedMs = Date.now() - servedAt.getTime();
  const remainingMs = Math.max(0, question.time_limit_seconds * 1000 - elapsedMs);

  const result: CurrentQuestion = {
    attemptQuestionId: Number(next.id),
    questionId: Number(question.id),
    position: next.position,
    total: Number(attempt.total),
    prompt: next.prompt_snapshot,
    kind: question.kind,
    timeLimitSeconds: question.time_limit_seconds,
    remainingMs
  };

  if (question.kind === 'MULTIPLE_CHOICE') {
    const options = await quizRepo.findOptions([question.id]);

    // Shuffled so the correct answer is not always in the position the author typed it, and
    // stripped of is_correct before it leaves the server.
    result.options = shuffled(options).map((option) => ({
      id: Number(option.id),
      body: option.body
    }));
  }

  return result;
}

export async function answer(
  id: string,
  viewer: SessionUser,
  given: { optionId?: number | undefined; text?: string | undefined }
): Promise<AnswerResult> {
  await ownedAttempt(id, viewer);

  const next = await repo.findNextUnanswered(id);

  if (!next) {
    throw new BadRequest('That attempt is already finished.');
  }

  if (next.question_id === null) {
    throw new NotFound('That question no longer exists.');
  }

  const question = await quizRepo.findQuestionById(next.question_id);

  if (!question) {
    throw new NotFound('That question no longer exists.');
  }

  const options = await quizRepo.findOptions([question.id]);

  // Elapsed is measured from the server's own stamp. A client clock is not evidence: it can be
  // paused, wound back, or simply wrong.
  const servedAt = next.served_at ?? (await repo.stampServed(next.id));
  const elapsedMs = Date.now() - servedAt.getTime();
  const timedOut = isTimedOut(elapsedMs, question.time_limit_seconds);

  const givenOptionId = given.optionId === undefined ? null : String(given.optionId);
  const givenText = given.text ?? null;

  let correct = false;

  if (!timedOut) {
    correct =
      question.kind === 'MULTIPLE_CHOICE'
        ? gradeMultipleChoice(givenOptionId, options)
        : gradeTyped(givenText ?? '', options.map((option) => option.body));
  }

  await repo.recordAnswer(next.id, {
    givenText,
    givenOptionId: question.kind === 'MULTIPLE_CHOICE' ? givenOptionId : null,
    isCorrect: correct,
    timedOut,
    elapsedMs
  });

  const finished = await repo.isComplete(id);

  if (finished) {
    await repo.finishAttempt(id);
  }

  return {
    correct,
    timedOut,
    // Only now, after the answer is in, does the right answer travel to the browser.
    correctAnswer: options
      .filter((option) => option.is_correct)
      .map((option) => option.body)
      .join(' / '),
    explanation: question.explanation,
    finished
  };
}

export async function finish(id: string, viewer: SessionUser): Promise<void> {
  await ownedAttempt(id, viewer);
  await repo.finishAttempt(id);
}

export interface AttemptResult extends AttemptSummary {
  questions: {
    position: number;
    prompt: string;
    yourAnswer: string | null;
    correctAnswer: string | null;
    isCorrect: boolean | null;
    timedOut: boolean;
    elapsedMs: number | null;
  }[];
}

export async function result(id: string, viewer: SessionUser): Promise<AttemptResult> {
  const attempt = await ownedAttempt(id, viewer);
  const rows = await repo.findAttemptQuestions(id);

  // The questions may since have been edited or deleted; the prompt snapshot is what was asked.
  // Answers are looked up live, which is the best available, and simply absent when gone.
  const questionIds = rows
    .map((row) => row.question_id)
    .filter((value): value is string => value !== null);

  const options = await quizRepo.findOptions(questionIds);

  return {
    ...toSummary(attempt),
    questions: rows.map((row) => {
      const mine = options.filter((option) => option.question_id === row.question_id);
      const chosen = mine.find((option) => option.id === row.given_option_id);

      return {
        position: row.position,
        prompt: row.prompt_snapshot,
        yourAnswer: chosen?.body ?? row.given_text,
        correctAnswer:
          mine.length === 0
            ? null
            : mine
                .filter((option) => option.is_correct)
                .map((option) => option.body)
                .join(' / '),
        isCorrect: row.is_correct,
        timedOut: row.timed_out,
        elapsedMs: row.elapsed_ms
      };
    })
  };
}

export async function history(viewer: SessionUser): Promise<AttemptSummary[]> {
  return (await repo.findAttemptsFor(viewer.id)).map(toSummary);
}

/** Deletes one of the viewer's own attempts from their history. A stranger's id is a 404. */
export async function remove(id: string, viewer: SessionUser): Promise<void> {
  const deleted = await repo.deleteAttempt(id, viewer.id);

  if (!deleted) {
    throw new NotFound('No such attempt.');
  }
}
