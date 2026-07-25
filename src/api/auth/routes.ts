import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { clientIp } from '../http/client-ip.js';
import { Conflict, Unauthorized } from '../http/errors.js';
import { parse } from '../http/validate.js';
import { hashPassword, verifyPassword } from './password.js';
import { findByEmail, findByUsername, insertUser, type UserRow } from './repo.js';
import { authedUser, requireAuth } from './require-auth.js';
import { createSession, destroySession } from './session.js';
import {
  assertLoginAllowed,
  assertSignupAllowed,
  clearLoginFailures,
  recordAuthEvent
} from './throttle.js';

/**
 * A genuine hash of a value nobody will ever know, so a login for a username that does not exist
 * can still do the full scrypt work. Computed lazily, once.
 */
let dummyHash: Promise<string> | undefined;

function unknownUserHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
  return dummyHash;
}

/** What the client is allowed to know about an account - never the hash. */
function publicUser(user: UserRow) {
  return {
    id: Number(user.id),
    username: user.username,
    email: user.email,
    role: user.role
  };
}

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'username must be at least 3 characters')
  .max(64, 'username must be at most 64 characters')
  // Letters, digits and a couple of separators. Keeping spaces and lookalike punctuation out
  // means a username cannot be dressed up to resemble somebody else's.
  .regex(/^[a-zA-Z0-9_-]+$/, 'username may only contain letters, numbers, _ and -');

const passwordSchema = z
  .string()
  // Length is the only rule. Composition requirements ("one capital, one symbol") push people
  // towards Passw0rd! and away from the long passphrases that actually resist guessing.
  .min(8, 'password must be at least 8 characters')
  .max(200, 'password must be at most 200 characters');

const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema
});

/**
 * Registration additionally requires an address, because sharing a quiz with a friend emails them.
 * An account without one would silently receive nothing.
 */
const registerSchema = z.object({
  username: usernameSchema,
  email: z
    .email('email is not a valid address')
    .max(254, 'email must be at most 254 characters')
    .trim(),
  password: passwordSchema
});

export const authRoutes = Router();

authRoutes.post('/register', async (req, res) => {
  const { username, email, password } = parse(registerSchema, req.body);
  const ip = clientIp(req);

  await assertSignupAllowed(ip);

  if (await findByUsername(username)) {
    throw new Conflict('That username is taken.');
  }

  if (await findByEmail(email)) {
    // Says so plainly rather than hiding it. The address is already discoverable through the
    // password-reset flow of any site that has one, and a vague error here just leaves someone
    // unable to work out why their registration will not go through.
    throw new Conflict('That email address already has an account.');
  }

  const user = await insertUser(username, email, await hashPassword(password));

  await recordAuthEvent('SIGNUP', ip, username);
  await createSession(res, user.id);

  // Registering signs you in. Making someone immediately retype the password they just chose is
  // ceremony without a purpose.
  res.status(201).json(publicUser(user));
});

authRoutes.post('/login', async (req, res) => {
  const { username, password } = parse(loginSchema, req.body);
  const ip = clientIp(req);

  await assertLoginAllowed(ip);

  const user = await findByUsername(username);

  // Verify even when there is no such user, against a hash that cannot match. Returning early
  // would make an unknown username measurably faster than a wrong password, which is a free way
  // to enumerate who has an account here.
  const stored = user?.password_hash ?? (await unknownUserHash());
  const matches = await verifyPassword(password, stored);

  if (!user || !matches) {
    await recordAuthEvent('LOGIN_FAILURE', ip, username);
    // One message for both cases, for the same reason.
    throw new Unauthorized('That username and password do not match.');
  }

  await clearLoginFailures(ip);
  await createSession(res, user.id);

  res.json(publicUser(user));
});

authRoutes.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.status(204).end();
});

authRoutes.get('/me', requireAuth, (req, res) => {
  const user = authedUser(req);
  res.json({
    id: Number(user.id),
    username: user.username,
    email: user.email,
    role: user.role
  });
});
