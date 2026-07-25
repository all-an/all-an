import { findByUsername } from '../auth/repo.js';
import type { SessionUser } from '../auth/session.js';
import { BadRequest, Conflict, Forbidden, NotFound } from '../http/errors.js';
import * as repo from './repo.js';
import type { FriendshipRow } from './repo.js';

export interface Friend {
  friendshipId: number;
  id: number;
  username: string;
  since: string;
}

export interface FriendRequest {
  friendshipId: number;
  id: number;
  username: string;
  direction: 'INCOMING' | 'OUTGOING';
  requestedAt: string;
}

function toFriend(row: FriendshipRow): Friend {
  return {
    friendshipId: Number(row.id),
    id: Number(row.other_id),
    username: row.other_username,
    since: row.created_at.toISOString()
  };
}

export async function listFriends(viewer: SessionUser): Promise<Friend[]> {
  return (await repo.findAccepted(viewer.id)).map(toFriend);
}

export async function listRequests(viewer: SessionUser): Promise<FriendRequest[]> {
  const rows = await repo.findPending(viewer.id);

  return rows.map((row) => ({
    friendshipId: Number(row.id),
    id: Number(row.other_id),
    username: row.other_username,
    direction: row.requester_id === viewer.id ? ('OUTGOING' as const) : ('INCOMING' as const),
    requestedAt: row.created_at.toISOString()
  }));
}

/**
 * Sends a friend request, by username.
 *
 * By username rather than by email on purpose: letting someone type an address and learn whether
 * it has an account here turns the friend finder into a way of testing whether a given person
 * uses this site.
 *
 * If they have already asked you, this accepts instead of failing. Two people adding each other
 * at the same moment is a normal thing to happen, and "you already have a request from them" is a
 * pointless obstacle when the outcome they both want is the same.
 */
export async function requestFriend(
  viewer: SessionUser,
  username: string
): Promise<{ status: 'PENDING' | 'ACCEPTED' }> {
  const target = await findByUsername(username);

  if (!target) {
    throw new NotFound('No account with that username.');
  }

  if (target.id === viewer.id) {
    throw new BadRequest('You cannot add yourself.');
  }

  const existing = await repo.findBetween(viewer.id, target.id);

  if (existing?.status === 'ACCEPTED') {
    throw new Conflict('You are already friends.');
  }

  if (existing?.status === 'PENDING') {
    if (existing.requester_id === viewer.id) {
      throw new Conflict('You have already asked them.');
    }

    await repo.acceptRequest(existing.id);
    return { status: 'ACCEPTED' };
  }

  await repo.insertRequest(viewer.id, target.id);
  return { status: 'PENDING' };
}

export async function acceptRequest(id: string, viewer: SessionUser): Promise<void> {
  const row = await repo.findById(id, viewer.id);

  if (!row || row.status !== 'PENDING') {
    throw new NotFound('No such request.');
  }

  // Only the person who was asked can accept. Otherwise the requester could accept their own.
  if (row.addressee_id !== viewer.id) {
    throw new Forbidden('Only the person who was asked can accept.');
  }

  await repo.acceptRequest(id);
}

/**
 * Declines an incoming request, or withdraws one you sent - the same row either way.
 *
 * Nothing distinguishes a declined request from one that was never sent, so the other side is not
 * told. Being told you were declined is worse than quietly nothing happening.
 */
export async function removeRequest(id: string, viewer: SessionUser): Promise<void> {
  const row = await repo.findById(id, viewer.id);

  if (!row || row.status !== 'PENDING') {
    throw new NotFound('No such request.');
  }

  await repo.deleteFriendship(id);
}

/**
 * Unfriends.
 *
 * The existing shares are deliberately left alone: a quiz somebody sent you and you have been
 * taking should not evaporate. Nothing new can be shared once the friendship is gone.
 */
export async function unfriend(friendshipId: string, viewer: SessionUser): Promise<void> {
  const row = await repo.findById(friendshipId, viewer.id);

  if (!row || row.status !== 'ACCEPTED') {
    throw new NotFound('No such friend.');
  }

  await repo.deleteFriendship(friendshipId);
}
