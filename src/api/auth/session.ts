import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

import { query, queryOne } from '../db/pool.js';

export const SESSION_COOKIE = 'sid';

/** Thirty days. Long enough that a study habit is not interrupted by re-authenticating. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  username: string;
  /** Carried on the session so sharing can name the sender without a second lookup. */
  email: string;
  role: 'ADMIN' | 'USER';
}

/**
 * The cookie carries the raw token; the database stores only its SHA-256.
 *
 * A plain hash rather than a password hash is right here: the token is 32 bytes of CSPRNG output,
 * so there is no dictionary to attack and nothing slow hashing would buy. What it does buy is that
 * a leaked dump of `sessions` contains no value anyone can present as a cookie.
 */
function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Reads the sid cookie without a cookie-parser dependency.
 *
 * One cookie, one name, no signing - the token is already unguessable, so signing it would only
 * protect against a threat that does not exist here.
 */
function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;

  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const index = part.indexOf('=');

    if (index === -1) {
      continue;
    }

    if (part.slice(0, index).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return undefined;
}

export async function createSession(res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [
    tokenHash(token),
    userId,
    expiresAt
  ]);

  res.cookie(SESSION_COOKIE, token, {
    // httpOnly so script on the page cannot read it, which is what makes an XSS bug fall short of
    // handing over the account.
    httpOnly: true,
    // Lax, not Strict: the cookie must survive following a link in from elsewhere, or arriving at
    // /quizzes from a bookmark would look like being signed out. Lax still blocks it on
    // cross-site POSTs, which is the CSRF case that matters.
    sameSite: 'lax',
    // Only over HTTPS in production. Set false locally or the cookie is dropped on plain http.
    secure: process.env['SESSION_COOKIE_SECURE'] === 'true',
    path: '/',
    expires: expiresAt
  });
}

/** Resolves the signed-in user, or undefined. Expired rows are treated as absent and swept. */
export async function currentUser(req: Request): Promise<SessionUser | undefined> {
  const token = readSessionCookie(req);

  if (!token) {
    return undefined;
  }

  const row = await queryOne<SessionUser>(
    `SELECT u.id, u.username, u.email, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW()`,
    [tokenHash(token)]
  );

  return row;
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = readSessionCookie(req);

  if (token) {
    await query('DELETE FROM sessions WHERE id = $1', [tokenHash(token)]);
  }

  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * Deletes expired sessions.
 *
 * Called at startup rather than on a timer: rows nobody can use are harmless, so the only cost of
 * leaving them is table size, and one sweep per deploy keeps that in hand without a scheduler.
 */
export async function sweepExpiredSessions(): Promise<void> {
  await query('DELETE FROM sessions WHERE expires_at <= NOW()');
}
