import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

/**
 * scrypt from node:crypto rather than bcrypt or argon2.
 *
 * Both of those are native modules, and a pure-stdlib hash keeps `npm ci` on Render free of a
 * compile step - which is the whole point of a deploy with no Docker image to bake toolchains
 * into. scrypt is memory-hard and a perfectly respectable password hash; the reason it is less
 * common is habit, not weakness.
 */
const N = 16_384; // CPU/memory cost. 16k * 128 * r bytes ~= 16 MB per hash.
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Node's default maxmem is 32 MB, which N=16384 sits just under. Stating it explicitly means a
// future bump to N fails loudly here rather than mysteriously at runtime.
const MAX_MEM = 64 * 1024 * 1024;

/**
 * Hashes a password into a self-describing string: scrypt$N$r$p$salt$hash.
 *
 * The parameters travel with the hash so they can be raised later without invalidating everybody's
 * password - an old hash still verifies against the parameters it was made with.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });

  return ['scrypt', N, R, P, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

/**
 * Checks a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash: a corrupt row should refuse the login,
 * not take down the endpoint for everyone.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');

  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string
  ];

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const salt = Buffer.from(saltRaw, 'base64url');
  const expected = Buffer.from(hashRaw, 'base64url');

  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  let derived: Buffer;

  try {
    derived = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: MAX_MEM });
  } catch {
    return false;
  }

  // timingSafeEqual, not ===. A normal comparison returns as soon as two bytes differ, and the
  // time it takes leaks how much of the hash was guessed correctly.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
