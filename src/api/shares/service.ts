import { findByIds } from '../auth/repo.js';
import type { SessionUser } from '../auth/session.js';
import { transaction } from '../db/pool.js';
import { areFriends } from '../friends/repo.js';
import { BadRequest, Forbidden, NotFound } from '../http/errors.js';
import { escapeHtml, sendMail, siteUrl } from '../mail/send.js';
import * as quizRepo from '../quizzes/repo.js';
import * as repo from './repo.js';

export interface SharedQuiz {
  shareId: number;
  quizId: number;
  title: string;
  subject: string;
  studyField: string;
  questionCount: number;
  sharedBy: string;
  sharedAt: string;
}

export interface SharedQuestion {
  shareId: number;
  questionId: number | null;
  prompt: string;
  kind: 'MULTIPLE_CHOICE' | 'TYPED';
  timeLimitSeconds: number;
  sharedBy: string;
  sharedAt: string;
  copied: boolean;
}

/**
 * Narrows a list of ids to the viewer's actual friends.
 *
 * Every share passes through here. Without it, a client could post any user id and push a quiz -
 * and an email - at a stranger, which is the exact thing the accept step exists to prevent.
 */
async function friendsAmong(viewer: SessionUser, ids: readonly number[]) {
  if (ids.length === 0) {
    throw new BadRequest('Choose at least one friend.');
  }

  const users = await findByIds(ids.map(String));
  const allowed = [];

  for (const user of users) {
    if (await areFriends(viewer.id, user.id)) {
      allowed.push(user);
    }
  }

  if (allowed.length === 0) {
    throw new Forbidden('You can only share with friends.');
  }

  return allowed;
}

export async function shareQuiz(
  viewer: SessionUser,
  quizId: string,
  friendIds: readonly number[]
): Promise<{ shared: number }> {
  const quiz = await quizRepo.findQuizById(quizId);

  if (!quiz || quiz.owner_id !== viewer.id) {
    throw new NotFound('No such quiz.');
  }

  if (Number(quiz.question_count) === 0) {
    throw new BadRequest('Add at least one question before sharing.');
  }

  const recipients = await friendsAmong(viewer, friendIds);
  let shared = 0;

  for (const recipient of recipients) {
    const isNew = await repo.shareQuiz(quizId, viewer.id, recipient.id);

    if (!isNew) {
      // Already shared with them. Re-sending the email would make the share button a way of
      // pestering somebody by clicking it repeatedly.
      continue;
    }

    shared += 1;

    await sendMail({
      to: recipient.email,
      subject: `${viewer.username} shared a quiz with you: ${quiz.title}`,
      text:
        `${viewer.username} shared the quiz "${quiz.title}" (${quiz.subject}) with you on all-an.\n\n` +
        `Take it here: ${siteUrl()}/quizzes/${quizId}\n`,
      html:
        `<p><strong>${escapeHtml(viewer.username)}</strong> shared the quiz ` +
        `"${escapeHtml(quiz.title)}" (${escapeHtml(quiz.subject)}) with you on all-an.</p>` +
        `<p><a href="${siteUrl()}/quizzes/${quizId}">Take it here</a></p>`
    });
  }

  return { shared };
}

export async function shareQuestion(
  viewer: SessionUser,
  questionId: string,
  friendIds: readonly number[]
): Promise<{ shared: number }> {
  const question = await quizRepo.findQuestionById(questionId);

  if (!question) {
    throw new NotFound('No such question.');
  }

  const quiz = await quizRepo.findQuizById(question.quiz_id);

  if (!quiz || quiz.owner_id !== viewer.id) {
    throw new NotFound('No such question.');
  }

  const recipients = await friendsAmong(viewer, friendIds);
  let shared = 0;

  for (const recipient of recipients) {
    if (!(await repo.shareQuestion(questionId, viewer.id, recipient.id))) {
      continue;
    }

    shared += 1;

    await sendMail({
      to: recipient.email,
      subject: `${viewer.username} shared a question with you`,
      text:
        `${viewer.username} shared a question with you on all-an:\n\n"${question.prompt}"\n\n` +
        `Copy it into one of your quizzes: ${siteUrl()}/shared\n`,
      html:
        `<p><strong>${escapeHtml(viewer.username)}</strong> shared a question with you on all-an:</p>` +
        `<blockquote>${escapeHtml(question.prompt)}</blockquote>` +
        `<p><a href="${siteUrl()}/shared">Copy it into one of your quizzes</a></p>`
    });
  }

  return { shared };
}

export async function listShared(viewer: SessionUser): Promise<{
  quizzes: SharedQuiz[];
  questions: SharedQuestion[];
}> {
  const [quizzes, questions] = await Promise.all([
    repo.findQuizSharesFor(viewer.id),
    repo.findQuestionSharesFor(viewer.id)
  ]);

  return {
    quizzes: quizzes.map((row) => ({
      shareId: Number(row.id),
      quizId: Number(row.quiz_id),
      title: row.quiz_title,
      subject: row.quiz_subject,
      studyField: row.study_field_name,
      questionCount: Number(row.question_count),
      sharedBy: row.shared_by_username,
      sharedAt: row.created_at.toISOString()
    })),
    questions: questions.map((row) => ({
      shareId: Number(row.id),
      questionId: row.question_id === null ? null : Number(row.question_id),
      prompt: row.prompt,
      kind: row.kind,
      timeLimitSeconds: row.time_limit_seconds,
      sharedBy: row.shared_by_username,
      sharedAt: row.created_at.toISOString(),
      copied: row.copied_at !== null
    }))
  };
}

/**
 * Copies a shared question into one of the recipient's own quizzes.
 *
 * A copy, not a reference: the new question is an ordinary row the recipient owns and can edit,
 * and the sender's original is untouched. Sharing a question and then editing it should not
 * silently rewrite what somebody else has already put in their quiz.
 */
export async function copySharedQuestion(
  viewer: SessionUser,
  shareId: string,
  targetQuizId: string
): Promise<{ questionId: number }> {
  const share = await repo.findQuestionShare(shareId, viewer.id);

  if (!share) {
    throw new NotFound('No such shared question.');
  }

  const source = await quizRepo.findQuestionById(share.question_id);

  if (!source) {
    throw new NotFound('That question no longer exists.');
  }

  const target = await quizRepo.findQuizById(targetQuizId);

  if (!target || target.owner_id !== viewer.id) {
    throw new NotFound('No such quiz.');
  }

  const options = await quizRepo.findOptions([source.id]);

  const questionId = await transaction(async (client) => {
    const id = await quizRepo.insertQuestion(client, targetQuizId, {
      kind: source.kind,
      prompt: source.prompt,
      explanation: source.explanation,
      timeLimitSeconds: source.time_limit_seconds
    });

    await quizRepo.replaceOptions(
      client,
      id,
      options.map((option) => ({ body: option.body, isCorrect: option.is_correct }))
    );

    return id;
  });

  await repo.markCopied(shareId);

  return { questionId: Number(questionId) };
}

export async function dismissQuiz(viewer: SessionUser, shareId: string): Promise<void> {
  await repo.dismissQuizShare(shareId, viewer.id);
}

export async function dismissQuestion(viewer: SessionUser, shareId: string): Promise<void> {
  await repo.dismissQuestionShare(shareId, viewer.id);
}
