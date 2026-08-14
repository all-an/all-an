import { Router } from 'express';
import { z } from 'zod';

import { authedUser, requireAdmin, requireAuth } from '../auth/require-auth.js';
import { parse } from '../http/validate.js';
import { readSettings, writeSettings } from './service.js';

/**
 * A save carries every setting, not the ones that changed.
 *
 * The admin page renders the whole set from one GET and posts the whole set back, so a full
 * document is what it naturally has. It also makes the write idempotent, which a partial patch
 * with optional fields is not obviously.
 */
const settingsSchema = z.object({
  registrationEnabled: z.boolean()
});

export const settingRoutes = Router();

/**
 * Public, and it has to be: the register and sign-in pages read this to decide whether to offer a
 * form at all, and both are the pages a signed-out visitor is on.
 *
 * Nothing here is a secret. It is one boolean describing a policy that anybody could discover by
 * submitting the form once.
 */
settingRoutes.get('/', async (_req, res) => {
  res.json(await readSettings());
});

settingRoutes.put('/', requireAuth, requireAdmin, async (req, res) => {
  const settings = parse(settingsSchema, req.body);
  const admin = authedUser(req);

  res.json(await writeSettings(settings, Number(admin.id)));
});
