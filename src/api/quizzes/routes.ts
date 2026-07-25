import { Router } from 'express';
import { z } from 'zod';

import { authedUser, requireAuth } from '../auth/require-auth.js';
import { currentUser } from '../auth/session.js';
import { idParam } from '../http/params.js';
import { parse } from '../http/validate.js';
import * as service from './service.js';

const quizSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(120, 'title must be at most 120 characters'),
  description: z.string().max(2000, 'description must be at most 2000 characters').optional(),
  studyFieldId: z.number().int('pick a study field'),
  subject: z
    .string()
    .trim()
    .min(1, 'subject is required')
    .max(64, 'subject must be at most 64 characters'),
  defaultTimeLimitSeconds: z
    .number()
    .int()
    .min(5, 'the time limit must be at least 5 seconds')
    .max(600, 'the time limit must be at most 10 minutes')
    .default(30),
  shuffleQuestions: z.boolean().default(false)
});

const questionSchema = z.object({
  kind: z.enum(['MULTIPLE_CHOICE', 'TYPED']),
  prompt: z
    .string()
    .trim()
    .min(1, 'the question is required')
    .max(2000, 'the question must be at most 2000 characters'),
  explanation: z.string().max(2000, 'the explanation must be at most 2000 characters').optional(),
  timeLimitSeconds: z
    .number()
    .int()
    .min(5, 'the time limit must be at least 5 seconds')
    .max(600, 'the time limit must be at most 10 minutes')
    .optional(),
  options: z
    .array(
      z.object({
        body: z.string().trim().max(300, 'an answer must be at most 300 characters'),
        isCorrect: z.boolean().default(false)
      })
    )
    .max(10, 'at most 10 answers')
});

const visibilitySchema = z.object({ visibility: z.enum(['PRIVATE', 'PUBLIC']) });
const orderSchema = z.object({ questionIds: z.array(z.number().int()).min(1) });

/** Query strings arrive as strings or not at all; normalise "" to absent. */
function optionalParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export const quizRoutes = Router();

// --- reference data ---------------------------------------------------------

quizRoutes.get('/study-fields', async (_req, res) => {
  res.json(await service.listStudyFields());
});

quizRoutes.get('/subjects', async (req, res) => {
  const viewer = await currentUser(req);
  const scope = req.query['scope'] === 'mine' ? 'mine' : 'public';

  res.json(await service.listSubjects(viewer, scope, optionalParam(req.query['studyField'])));
});

// --- the public pool --------------------------------------------------------

// Declared before '/:id' so the literal path is not swallowed by the parameter.
quizRoutes.get('/public', async (req, res) => {
  const viewer = await currentUser(req);
  const limit = Math.min(Number(req.query['limit'] ?? 50) || 50, 100);
  const offset = Math.max(Number(req.query['offset'] ?? 0) || 0, 0);

  res.json(
    await service.listPublic(
      viewer,
      optionalParam(req.query['studyField']),
      optionalParam(req.query['subject']),
      limit,
      offset,
      req.query['archived'] === 'true'
    )
  );
});

// --- your own quizzes -------------------------------------------------------

quizRoutes.get('/', requireAuth, async (req, res) => {
  res.json(
    await service.listOwn(
      authedUser(req),
      optionalParam(req.query['studyField']),
      optionalParam(req.query['subject']),
      req.query['archived'] === 'true'
    )
  );
});

quizRoutes.post('/', requireAuth, async (req, res) => {
  res.status(201).json(await service.createQuiz(authedUser(req), parse(quizSchema, req.body)));
});

quizRoutes.get('/:id', async (req, res) => {
  const viewer = await currentUser(req);
  res.json(await service.readQuiz(idParam(req), viewer));
});

quizRoutes.put('/:id', requireAuth, async (req, res) => {
  res.json(await service.editQuiz(idParam(req), authedUser(req), parse(quizSchema, req.body)));
});

quizRoutes.patch('/:id/visibility', requireAuth, async (req, res) => {
  const { visibility } = parse(visibilitySchema, req.body);
  res.json(await service.setVisibility(idParam(req), authedUser(req), visibility));
});

quizRoutes.delete('/:id', requireAuth, async (req, res) => {
  await service.removeQuiz(idParam(req), authedUser(req));
  res.status(204).end();
});

// Per-user archiving. A PUT/DELETE pair rather than a body flag, so "archive" and "unarchive" are
// each their own idempotent request.
quizRoutes.put('/:id/archive', requireAuth, async (req, res) => {
  await service.setArchived(idParam(req), authedUser(req), true);
  res.status(204).end();
});

quizRoutes.delete('/:id/archive', requireAuth, async (req, res) => {
  await service.setArchived(idParam(req), authedUser(req), false);
  res.status(204).end();
});

// --- questions --------------------------------------------------------------

quizRoutes.post('/:id/questions', requireAuth, async (req, res) => {
  res
    .status(201)
    .json(await service.addQuestion(idParam(req), authedUser(req), parse(questionSchema, req.body)));
});

quizRoutes.patch('/:id/order', requireAuth, async (req, res) => {
  const { questionIds } = parse(orderSchema, req.body);
  res.json(await service.reorder(idParam(req), authedUser(req), questionIds));
});

/**
 * Questions are addressed on their own rather than under their quiz, because the client always
 * has the question id in hand and the quiz is implied by it. Ownership is still checked through
 * the parent quiz.
 */
export const questionRoutes = Router();

questionRoutes.put('/:id', requireAuth, async (req, res) => {
  res.json(await service.editQuestion(idParam(req), authedUser(req), parse(questionSchema, req.body)));
});

questionRoutes.delete('/:id', requireAuth, async (req, res) => {
  res.json(await service.removeQuestion(idParam(req), authedUser(req)));
});

questionRoutes.put('/:id/archive', requireAuth, async (req, res) => {
  await service.setQuestionArchived(idParam(req), authedUser(req), true);
  res.status(204).end();
});

questionRoutes.delete('/:id/archive', requireAuth, async (req, res) => {
  await service.setQuestionArchived(idParam(req), authedUser(req), false);
  res.status(204).end();
});
