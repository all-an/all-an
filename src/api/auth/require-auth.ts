import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { Forbidden, Unauthorized } from '../http/errors.js';
import { currentUser, type SessionUser } from './session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. Absent on routes that do not use it. */
      user?: SessionUser;
    }
  }
}

/** Rejects the request unless it carries a valid session. */
export const requireAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const user = await currentUser(req);

  if (!user) {
    next(new Unauthorized());
    return;
  }

  req.user = user;
  next();
};

/**
 * Layers the role check on top. Mount after requireAuth.
 *
 * The only thing this gates is removing a quiz from the shared public pool - moderation, not
 * administration. There is deliberately no admin UI beyond that.
 */
export const requireAdmin: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    next(new Forbidden('That needs an administrator.'));
    return;
  }

  next();
};

/** The user, for routes mounted behind requireAuth. Throws rather than returning undefined. */
export function authedUser(req: Request): SessionUser {
  if (!req.user) {
    throw new Unauthorized();
  }

  return req.user;
}
