import type { Request } from 'express';

/** The messages and auth_events tables both store IPv6's longest text form, 45 characters. */
const MAX_LENGTH = 45;

/**
 * The client's address, as the throttles should see it.
 *
 * `req.ip` already respects the app's `trust proxy` setting, so behind Render's proxy this is the
 * address from X-Forwarded-For rather than the proxy's own. That trust is the whole reason the
 * setting exists: without it every request in production shares one address and a single sender
 * would exhaust the daily limit for everyone at once.
 *
 * It is only as trustworthy as the proxy in front of the app. Exposed directly to the internet,
 * anyone could set X-Forwarded-For to whatever they liked - which is why this is a courtesy
 * throttle, not a security control.
 */
export function clientIp(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

  // Node reports IPv4 clients on a dual-stack socket as ::ffff:203.0.113.9. Storing both forms for
  // one address would let a sender through twice, so normalise to the plain IPv4 form.
  const normalised = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;

  return normalised.slice(0, MAX_LENGTH);
}
