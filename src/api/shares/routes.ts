import { Router } from 'express';
import { z } from 'zod';

import { authedUser, requireAuth } from '../auth/require-auth.js';
import { idParam } from '../http/params.js';
import { parse } from '../http/validate.js';
import * as service from './service.js';

const shareSchema = z.object({
  friendIds: z.array(z.number().int()).min(1, 'choose at least one friend').max(50)
});

const copySchema = z.object({ quizId: z.number().int() });

/**
 * Sending things. Mounted under the resource being shared, so the id in the path is the quiz or
 * question rather than the share.
 *
 * requireAuth goes on each route rather than on the router. This one is mounted at the API root
 * so that its two-segment paths resolve, and a router-wide `use(requireAuth)` there would gate
 * every request that passes through - including the public pool, which must stay readable to
 * somebody who has not signed in.
 */
export const shareActionRoutes = Router();

shareActionRoutes.post('/quizzes/:id/shares', requireAuth, async (req, res) => {
  const { friendIds } = parse(shareSchema, req.body);
  res.status(201).json(await service.shareQuiz(authedUser(req), idParam(req), friendIds));
});

shareActionRoutes.post('/questions/:id/shares', requireAuth, async (req, res) => {
  const { friendIds } = parse(shareSchema, req.body);
  res.status(201).json(await service.shareQuestion(authedUser(req), idParam(req), friendIds));
});

/** Receiving things. Mounted at /api/shares. */
export const shareRoutes = Router();

shareRoutes.use(requireAuth);

shareRoutes.get('/', async (req, res) => {
  res.json(await service.listShared(authedUser(req)));
});

shareRoutes.post('/questions/:id/copy', async (req, res) => {
  const { quizId } = parse(copySchema, req.body);
  res.status(201).json(await service.copySharedQuestion(authedUser(req), idParam(req), String(quizId)));
});

shareRoutes.delete('/quizzes/:id', async (req, res) => {
  await service.dismissQuiz(authedUser(req), idParam(req));
  res.status(204).end();
});

shareRoutes.delete('/questions/:id', async (req, res) => {
  await service.dismissQuestion(authedUser(req), idParam(req));
  res.status(204).end();
});
