import { hashPassword } from './password.js';
import { findByUsername, insertUser } from './repo.js';

/**
 * Creates the administrator at startup from the environment, if it does not already exist.
 *
 * From the environment and never from a migration: a password committed to a SQL file is a
 * password published to anyone who can read the repository, and it would be identical on every
 * deployment of this codebase.
 *
 * The admin exists for exactly one job - removing a quiz somebody published to the shared pool.
 * The variables being absent is the normal case for a local checkout, and simply means no admin.
 */
export async function bootstrapAdmin(): Promise<void> {
  const username = process.env['ADMIN_USERNAME'];
  const password = process.env['ADMIN_PASSWORD'];
  const email = process.env['ADMIN_EMAIL'];

  if (!username || !password) {
    return;
  }

  if (!email) {
    console.warn('ADMIN_USERNAME is set but ADMIN_EMAIL is not; skipping admin creation.');
    return;
  }

  if (await findByUsername(username)) {
    // Deliberately not resetting the password of an existing account. A redeploy should not
    // silently overwrite a credential that was changed for a reason.
    return;
  }

  await insertUser(username, email, await hashPassword(password), 'ADMIN');
  console.log(`Created administrator "${username}".`);
}
