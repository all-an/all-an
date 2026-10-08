"""Friend requests and friendships. A friendship is one row, from the requester to the addressee,
that is PENDING until the addressee accepts."""

from . import db, users
from .errors import ApiError
from .util import iso

# Every friendship query is from one user's side: %(me)s is them, and `other` is whoever is at the
# other end, whichever of the two columns that happens to be.
_SELECT = """
  SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at,
         other.id AS other_id, other.username AS other_username
  FROM friendships f
  JOIN users other
    ON other.id = CASE WHEN f.requester_id = %(me)s THEN f.addressee_id ELSE f.requester_id END"""


def _find(friendship_id: int, user_id: int) -> dict | None:
    return db.query_one(
        f"{_SELECT} WHERE f.id = %(id)s AND %(me)s IN (f.requester_id, f.addressee_id)",
        {"me": user_id, "id": friendship_id},
    )


def are_friends(a: int, b: int) -> bool:
    return db.query_one(
        """
        SELECT EXISTS (
          SELECT 1 FROM friendships
          WHERE status = 'ACCEPTED'
            AND ((requester_id = %(a)s AND addressee_id = %(b)s)
              OR (requester_id = %(b)s AND addressee_id = %(a)s))
        ) AS e
        """,
        {"a": a, "b": b},
    )["e"]


def list_friends(viewer: dict) -> list[dict]:
    rows = db.query(
        f"""{_SELECT}
            WHERE f.status = 'ACCEPTED' AND %(me)s IN (f.requester_id, f.addressee_id)
            ORDER BY other.username""",
        {"me": viewer["id"]},
    )
    return [
        {"friendshipId": r["id"], "id": r["other_id"], "username": r["other_username"], "since": iso(r["created_at"])}
        for r in rows
    ]


def list_requests(viewer: dict) -> list[dict]:
    rows = db.query(
        f"""{_SELECT}
            WHERE f.status = 'PENDING' AND %(me)s IN (f.requester_id, f.addressee_id)
            ORDER BY f.created_at DESC""",
        {"me": viewer["id"]},
    )
    return [
        {
            "friendshipId": r["id"],
            "id": r["other_id"],
            "username": r["other_username"],
            "direction": "OUTGOING" if r["requester_id"] == viewer["id"] else "INCOMING",
            "requestedAt": iso(r["created_at"]),
        }
        for r in rows
    ]


def _accept_row(friendship_id: int) -> None:
    db.execute(
        "UPDATE friendships SET status = 'ACCEPTED', responded_at = NOW() "
        "WHERE id = %s AND status = 'PENDING'",
        (friendship_id,),
    )


def request_friend(viewer: dict, username: str) -> str:
    """Asking somebody who has already asked you is just saying yes, so it accepts - two people
    adding each other at the same moment end up friends instead of in a stalemate of crossed
    requests. Returns the resulting status."""
    target = users.find_by_username(username)

    if target is None:
        raise ApiError.not_found("No account with that username.")

    if target["id"] == viewer["id"]:
        raise ApiError.bad_request("You cannot add yourself.")

    existing = db.query_one(
        """
        SELECT id, requester_id, status FROM friendships
        WHERE (requester_id = %(a)s AND addressee_id = %(b)s)
           OR (requester_id = %(b)s AND addressee_id = %(a)s)
        """,
        {"a": viewer["id"], "b": target["id"]},
    )

    if existing:
        if existing["status"] == "ACCEPTED":
            raise ApiError.conflict("You are already friends.")

        if existing["requester_id"] == viewer["id"]:
            raise ApiError.conflict("You have already asked them.")

        _accept_row(existing["id"])
        return "ACCEPTED"

    db.execute(
        "INSERT INTO friendships (requester_id, addressee_id) VALUES (%s, %s)", (viewer["id"], target["id"])
    )
    return "PENDING"


def accept_request(friendship_id: int, viewer: dict) -> None:
    row = _find(friendship_id, viewer["id"])

    if not row or row["status"] != "PENDING":
        raise ApiError.not_found("No such request.")

    if row["addressee_id"] != viewer["id"]:
        raise ApiError.forbidden("Only the person who was asked can accept.")

    _accept_row(friendship_id)


def remove_request(friendship_id: int, viewer: dict) -> None:
    """Either side may remove a pending request: the asker withdraws it, the asked declines it."""
    row = _find(friendship_id, viewer["id"])

    if not row or row["status"] != "PENDING":
        raise ApiError.not_found("No such request.")

    db.execute("DELETE FROM friendships WHERE id = %s", (friendship_id,))


def unfriend(friendship_id: int, viewer: dict) -> None:
    row = _find(friendship_id, viewer["id"])

    if not row or row["status"] != "ACCEPTED":
        raise ApiError.not_found("No such friend.")

    db.execute("DELETE FROM friendships WHERE id = %s", (friendship_id,))
