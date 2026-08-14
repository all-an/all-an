import { json, Router, type RequestHandler } from 'express';

import { bootstrapAdmin } from './auth/bootstrap-admin.js';
import { authRoutes } from './auth/routes.js';
import { sweepExpiredSessions } from './auth/session.js';
import { ensureMigrated } from './db/migrate.js';
import { queryOne } from './db/pool.js';
import { errorHandler, NotFound } from './http/errors.js';
import { attemptRoutes } from './attempts/routes.js';
import { friendRoutes } from './friends/routes.js';
import { messageRoutes } from './message/routes.js';
import { questionRoutes, quizRoutes } from './quizzes/routes.js';
import { settingRoutes } from './settings/routes.js';
import { shareActionRoutes, shareRoutes } from './shares/routes.js';

let started: Promise<void> | undefined;

/**
 * Everything that must happen once, after the schema is in place and before traffic arrives:
 * migrate, create the administrator if the environment asks for one, drop dead sessions.
 *
 * Memoised rather than guarded by a boolean, so concurrent first requests wait on one run instead
 * of racing into several. A failure clears the memo so the next attempt retries - the usual cause
 * is a database that was not up yet.
 */
export function startup(): Promise<void> {
  started ??= (async () => {
    await ensureMigrated();
    await bootstrapAdmin();
    await sweepExpiredSessions();
  })().catch((error: unknown) => {
    started = undefined;
    throw error;
  });

  return started;
}

/**
 * Builds the /api router.
 *
 * Mounted ahead of the Angular handler in server.ts, so an API path never reaches the renderer.
 * That ordering is what replaces the hand-rolled "if the path starts with api/, don't serve
 * index.html" rule the Spring version needed.
 */
export function createApiRouter(): Router {
  const api = Router();

  // Generous enough for a quiz with a few dozen questions, tight enough that a stray large upload
  // is rejected before it is parsed rather than after.
  api.use(json({ limit: '256kb' }));

  // Production runs startup() before it listens, so this is already resolved by the first request.
  // Under `ng serve` there is no startup hook at all, and this is what makes the dev server usable
  // against a fresh database.
  api.use((async (_req, _res, next) => {
    await startup();
    next();
  }) as RequestHandler);

  api.use('/auth', authRoutes);
  api.use('/attempts', attemptRoutes);
  api.use('/friends', friendRoutes);
  // Before the quiz and question routers, so POST /quizzes/:id/shares is matched here rather
  // than falling through to the quiz router and 404ing.
  api.use(shareActionRoutes);
  api.use('/shares', shareRoutes);
  api.use('/quizzes', quizRoutes);
  api.use('/questions', questionRoutes);
  api.use('/messages', messageRoutes);
  api.use('/settings', settingRoutes);

  // An unmatched /api path is a 404 in JSON. Without this it would fall through to the Angular
  // handler and a fetch expecting JSON would receive a page of HTML with a 200 on it.
  api.use((req) => {
    throw new NotFound(`No API route for ${req.method} ${req.originalUrl}`);
  });

  api.use(errorHandler);

  return api;
}

/**
 * Render polls this to decide whether a deploy is live.
 *
 * It checks the database rather than just returning 200, because an instance that cannot reach
 * Postgres can serve no page that matters - reporting it healthy would let a broken deploy
 * replace a working one.
 */
export const healthHandler: RequestHandler = async (_req, res) => {
  try {
    await startup();
    await queryOne('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Health check failed', error);
    res.status(503).json({ status: 'unavailable' });
  }
};
