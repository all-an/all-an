import { query, queryOne } from '../db/pool.js';

export interface MessageRow {
  id: string;
  created_at: Date;
}

/**
 * Has this address already sent something since `since`?
 *
 * Hits idx_messages_ip_created_at and stops at the first row - LIMIT 1 rather than a COUNT,
 * because the answer is a yes/no and counting would read every match.
 */
export async function hasPostedSince(ip: string, since: Date): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM messages WHERE ip = $1 AND created_at >= $2) AS exists',
    [ip, since]
  );

  return row?.exists ?? false;
}

export async function insertMessage(
  ip: string,
  name: string | null,
  email: string | null,
  body: string
): Promise<MessageRow> {
  const rows = await query<MessageRow>(
    `INSERT INTO messages (ip, name, email, body, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, created_at`,
    [ip, name, email, body]
  );

  return rows[0]!;
}
