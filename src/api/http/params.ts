import type { Request } from 'express';

import { NotFound } from './errors.js';

/**
 * Reads a numeric path parameter.
 *
 * Kept as a string rather than converted: these are bigint primary keys, and JavaScript numbers
 * stop being exact well before bigint does. Nothing in this app ever does arithmetic on an id.
 *
 * A non-numeric value is a 404 rather than something Postgres refuses to cast - "/quizzes/abc"
 * should read as "no such quiz", not as a server error.
 */
export function idParam(req: Request, name = 'id'): string {
  const raw: unknown = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new NotFound('Not found.');
  }

  return value;
}
