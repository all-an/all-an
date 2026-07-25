import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const hash = await hashPassword('a-good-passphrase');
    expect(await verifyPassword('a-good-passphrase', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('a-good-passphrase');
    expect(await verifyPassword('a-good-passphras', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    // Two identical passwords with one hash would tell anyone reading the table which accounts
    // share a password.
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(first).not.toBe(second);
  });

  it('records the parameters in the hash, so they can be raised later', async () => {
    const hash = await hashPassword('a-good-passphrase');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(hash.split('$')).toHaveLength(6);
  });

  it('refuses a malformed or tampered hash rather than throwing', async () => {
    // A corrupt row should fail that one login, not take the endpoint down for everybody.
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$16384$8$1$only-five-parts')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$16384$8$1$c2FsdA$aGFzaA')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$1$c2FsdA$aGFzaA')).toBe(false);
  });

  it('rejects a hash whose stored digest has been swapped', async () => {
    const hash = await hashPassword('a-good-passphrase');
    const parts = hash.split('$');
    parts[5] = Buffer.from('nonsense').toString('base64url');

    expect(await verifyPassword('a-good-passphrase', parts.join('$'))).toBe(false);
  });
});
