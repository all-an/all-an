import { Router } from 'express';
import { z } from 'zod';

import { authedUser, requireAuth } from '../auth/require-auth.js';
import { idParam } from '../http/params.js';
import { parse } from '../http/validate.js';
import * as service from './service.js';

const requestSchema = z.object({
  username: z.string().trim().min(1, 'username is required').max(64)
});

export const friendRoutes = Router();

// Everything here is about the signed-in person, so the whole router is behind the guard.
friendRoutes.use(requireAuth);

friendRoutes.get('/', async (req, res) => {
  res.json(await service.listFriends(authedUser(req)));
});

friendRoutes.get('/requests', async (req, res) => {
  res.json(await service.listRequests(authedUser(req)));
});

friendRoutes.post('/requests', async (req, res) => {
  const { username } = parse(requestSchema, req.body);
  const result = await service.requestFriend(authedUser(req), username);

  res.status(201).json(result);
});

friendRoutes.post('/requests/:id/accept', async (req, res) => {
  await service.acceptRequest(idParam(req), authedUser(req));
  res.status(204).end();
});

friendRoutes.delete('/requests/:id', async (req, res) => {
  await service.removeRequest(idParam(req), authedUser(req));
  res.status(204).end();
});

friendRoutes.delete('/:id', async (req, res) => {
  await service.unfriend(idParam(req), authedUser(req));
  res.status(204).end();
});
