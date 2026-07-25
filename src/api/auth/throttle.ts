import { query, queryOne } from '../db/pool.js';
import { TooManyRequests } from '../http/errors.js';

/**
 * Three accounts per address per day. Enough for a household or an office behind one NAT, few
 * enough that scripting a thousand accounts needs a thousand addresses.
 */
const MAX_SIGNUPS_PER_DAY = 3;

/**
 * Five failures inside fifteen minutes, then a pause. Aimed at online guessing, which is slow and
 * noisy; it does nothing about an offline attack on a stolen hash, which is scrypt's job.
 */
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MINUTES = 15;

export async function recordAuthEvent(
  kind: 'LOGIN_FAILURE' | 'SIGNUP',
  ip: string,
  username?: string
): Promise<void> {
  await query('INSERT INTO auth_events (ip, username, kind) VALUES ($1, $2, $3)', [
    ip,
    username ?? null,
    kind
  ]);
}

export async function assertSignupAllowed(ip: string): Promise<void> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM auth_events
     WHERE ip = $1 AND kind = 'SIGNUP' AND created_at >= NOW() - INTERVAL '1 day'`,
    [ip]
  );

  if (Number(row?.count ?? 0) >= MAX_SIGNUPS_PER_DAY) {
    throw new TooManyRequests('Too many accounts have been created from this address today.');
  }
}

/**
 * Blocks further attempts from an address that has been failing.
 *
 * Counted per address rather than per username on purpose. Per-username lockout lets anyone lock
 * you out of your own account by guessing at it - the attacker's failures become your problem.
 */
export async function assertLoginAllowed(ip: string): Promise<void> {
  const row = await queryOne<{ count: string; oldest: Date | null }>(
    `SELECT COUNT(*) AS count, MIN(created_at) AS oldest FROM auth_events
     WHERE ip = $1 AND kind = 'LOGIN_FAILURE'
       AND created_at >= NOW() - ($2 || ' minutes')::INTERVAL`,
    [ip, LOGIN_WINDOW_MINUTES]
  );

  if (Number(row?.count ?? 0) < MAX_LOGIN_FAILURES) {
    return;
  }

  // Retry-After counts from the oldest failure still inside the window: that is the moment the
  // count drops below the threshold, so it is an honest answer rather than a flat guess.
  const oldest = row?.oldest ?? new Date();
  const retryAfterMs = oldest.getTime() + LOGIN_WINDOW_MINUTES * 60_000 - Date.now();
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

  throw new TooManyRequests('Too many failed sign-ins from this address. Try again shortly.', {
    retryAfterSeconds
  });
}

/** A successful sign-in clears the slate, so a typo followed by success costs nothing later. */
export async function clearLoginFailures(ip: string): Promise<void> {
  await query(`DELETE FROM auth_events WHERE ip = $1 AND kind = 'LOGIN_FAILURE'`, [ip]);
}
