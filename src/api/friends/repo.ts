import { query, queryOne } from '../db/pool.js';

export type FriendshipStatus = 'PENDING' | 'ACCEPTED';

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: Date;
  /** The other person, resolved by the query rather than by a second round trip. */
  other_id: string;
  other_username: string;
}

/**
 * A friendship row plus whoever the viewer is not.
 *
 * The pair is stored once, in whichever direction it was asked, so every read has to work out
 * which end the viewer is on. Doing it in SQL keeps that decision in one place.
 */
const FRIENDSHIP_SELECT = `
  SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at,
         other.id AS other_id, other.username AS other_username
  FROM friendships f
  JOIN users other
    ON other.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
`;

export async function findAccepted(userId: string): Promise<FriendshipRow[]> {
  return query<FriendshipRow>(
    `${FRIENDSHIP_SELECT}
     WHERE f.status = 'ACCEPTED' AND $1 IN (f.requester_id, f.addressee_id)
     ORDER BY other.username`,
    [userId]
  );
}

export async function findPending(userId: string): Promise<FriendshipRow[]> {
  return query<FriendshipRow>(
    `${FRIENDSHIP_SELECT}
     WHERE f.status = 'PENDING' AND $1 IN (f.requester_id, f.addressee_id)
     ORDER BY f.created_at DESC`,
    [userId]
  );
}

export async function findById(id: string, userId: string): Promise<FriendshipRow | undefined> {
  return queryOne<FriendshipRow>(
    `${FRIENDSHIP_SELECT} WHERE f.id = $2 AND $1 IN (f.requester_id, f.addressee_id)`,
    [userId, id]
  );
}

/** The existing relationship between two people, in whichever direction it was created. */
export async function findBetween(
  a: string,
  b: string
): Promise<{ id: string; requester_id: string; status: FriendshipStatus } | undefined> {
  return queryOne(
    `SELECT id, requester_id, status FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)`,
    [a, b]
  );
}

export async function insertRequest(requesterId: string, addresseeId: string): Promise<string> {
  const rows = await query<{ id: string }>(
    'INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2) RETURNING id',
    [requesterId, addresseeId]
  );

  return rows[0]!.id;
}

export async function acceptRequest(id: string): Promise<void> {
  await query(
    `UPDATE friendships SET status = 'ACCEPTED', responded_at = NOW()
     WHERE id = $1 AND status = 'PENDING'`,
    [id]
  );
}

export async function deleteFriendship(id: string): Promise<void> {
  await query('DELETE FROM friendships WHERE id = $1', [id]);
}

/** Whether these two may share with each other. The gate every share passes through. */
export async function areFriends(a: string, b: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM friendships
       WHERE status = 'ACCEPTED'
         AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))
     ) AS exists`,
    [a, b]
  );

  return row?.exists ?? false;
}
