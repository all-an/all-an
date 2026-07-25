import { Router } from 'express';
import { z } from 'zod';

import { authedUser, requireAuth } from '../auth/require-auth.js';
import { idParam } from '../http/params.js';
import { parse } from '../http/validate.js';
import * as service from './service.js';

const startSchema = z.object({ quizId: z.number().int() });

/**
 * One of the two must be present, according to the question's kind. Which one is right is the
 * server's business, not the client's - sending the wrong one simply grades as incorrect.
 */
const answerSchema = z.object({
  optionId: z.number().int().optional(),
  text: z.string().max(500, 'that answer is too long').optional()
});

export const attemptRoutes = Router();

attemptRoutes.use(requireAuth);

attemptRoutes.get('/', async (req, res) => {
  res.json(await service.history(authedUser(req)));
});

attemptRoutes.post('/', async (req, res) => {
  const { quizId } = parse(startSchema, req.body);
  res.status(201).json(await service.start(authedUser(req), String(quizId)));
});

attemptRoutes.get('/:id/current', async (req, res) => {
  res.json(await service.current(idParam(req), authedUser(req)));
});

attemptRoutes.post('/:id/answer', async (req, res) => {
  res.json(await service.answer(idParam(req), authedUser(req), parse(answerSchema, req.body)));
});

attemptRoutes.post('/:id/finish', async (req, res) => {
  await service.finish(idParam(req), authedUser(req));
  res.status(204).end();
});

attemptRoutes.get('/:id', async (req, res) => {
  res.json(await service.result(idParam(req), authedUser(req)));
});

attemptRoutes.delete('/:id', async (req, res) => {
  await service.remove(idParam(req), authedUser(req));
  res.status(204).end();
});
