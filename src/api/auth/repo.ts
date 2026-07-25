import { query, queryOne } from '../db/pool.js';

export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: 'ADMIN' | 'USER';
}

/** Case-insensitive, matching the unique index on LOWER(username). */
export async function findByUsername(username: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(
    'SELECT id, username, email, password_hash, role FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );
}

export async function findByEmail(email: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(
    'SELECT id, username, email, password_hash, role FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
}

/** Resolves several accounts at once, for addressing a share to a handful of friends. */
export async function findByIds(ids: readonly string[]): Promise<UserRow[]> {
  if (ids.length === 0) {
    return [];
  }

  return query<UserRow>(
    'SELECT id, username, email, password_hash, role FROM users WHERE id = ANY($1::bigint[])',
    [ids]
  );
}

export async function insertUser(
  username: string,
  email: string,
  passwordHash: string,
  role: 'ADMIN' | 'USER' = 'USER'
): Promise<UserRow> {
  const rows = await query<UserRow>(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, password_hash, role`,
    [username, email, passwordHash, role]
  );

  return rows[0]!;
}
