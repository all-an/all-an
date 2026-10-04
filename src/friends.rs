use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};

use crate::{
    auth::SessionUser,
    error::{ApiError, ApiResult},
    users,
};

#[derive(Debug, FromRow)]
struct FriendshipRow {
    id: i64,
    requester_id: i64,
    addressee_id: i64,
    status: String,
    created_at: DateTime<Utc>,
    other_id: i64,
    other_username: String,
}

/// Every friendship query is from one user's side: $1 is them, and `other` is whoever is at the
/// other end, whichever of the two columns that happens to be.
const FRIENDSHIP_SELECT: &str = "
  SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at,
         other.id AS other_id, other.username AS other_username
  FROM friendships f
  JOIN users other
    ON other.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END";

async fn find_by_id(pool: &PgPool, id: i64, user_id: i64) -> sqlx::Result<Option<FriendshipRow>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!("{FRIENDSHIP_SELECT} WHERE f.id = $2 AND $1 IN (f.requester_id, f.addressee_id)")))
        .bind(user_id)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn are_friends(pool: &PgPool, a: i64, b: i64) -> sqlx::Result<bool> {
    let (exists,): (bool,) = sqlx::query_as(
        "SELECT EXISTS (
           SELECT 1 FROM friendships
           WHERE status = 'ACCEPTED'
             AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))
         )",
    )
    .bind(a)
    .bind(b)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub friendship_id: i64,
    pub id: i64,
    pub username: String,
    pub since: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendRequest {
    pub friendship_id: i64,
    pub id: i64,
    pub username: String,
    pub direction: &'static str,
    pub requested_at: String,
}

pub async fn list_friends(pool: &PgPool, viewer: &SessionUser) -> ApiResult<Vec<Friend>> {
    let rows: Vec<FriendshipRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "{FRIENDSHIP_SELECT}
         WHERE f.status = 'ACCEPTED' AND $1 IN (f.requester_id, f.addressee_id)
         ORDER BY other.username"
    )))
    .bind(viewer.id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| Friend {
            friendship_id: row.id,
            id: row.other_id,
            username: row.other_username,
            since: row.created_at.to_rfc3339_opts(SecondsFormat::Millis, true),
        })
        .collect())
}

pub async fn list_requests(pool: &PgPool, viewer: &SessionUser) -> ApiResult<Vec<FriendRequest>> {
    let rows: Vec<FriendshipRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "{FRIENDSHIP_SELECT}
         WHERE f.status = 'PENDING' AND $1 IN (f.requester_id, f.addressee_id)
         ORDER BY f.created_at DESC"
    )))
    .bind(viewer.id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| FriendRequest {
            friendship_id: row.id,
            id: row.other_id,
            username: row.other_username,
            direction: if row.requester_id == viewer.id { "OUTGOING" } else { "INCOMING" },
            requested_at: row.created_at.to_rfc3339_opts(SecondsFormat::Millis, true),
        })
        .collect())
}

async fn accept_row(pool: &PgPool, id: i64) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE friendships SET status = 'ACCEPTED', responded_at = NOW()
         WHERE id = $1 AND status = 'PENDING'",
    )
    .bind(id)
    .execute(pool)
    .await?;

    Ok(())
}

async fn delete_row(pool: &PgPool, id: i64) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM friendships WHERE id = $1").bind(id).execute(pool).await?;
    Ok(())
}

/// Asking somebody who has already asked you is just saying yes, so it accepts - two people adding
/// each other at the same moment end up friends instead of in a stalemate of crossed requests.
pub async fn request_friend(pool: &PgPool, viewer: &SessionUser, username: &str) -> ApiResult<&'static str> {
    let target = users::find_by_username(pool, username)
        .await?
        .ok_or_else(|| ApiError::not_found("No account with that username."))?;

    if target.id == viewer.id {
        return Err(ApiError::bad_request("You cannot add yourself."));
    }

    let existing: Option<(i64, i64, String)> = sqlx::query_as(
        "SELECT id, requester_id, status FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2)
            OR (requester_id = $2 AND addressee_id = $1)",
    )
    .bind(viewer.id)
    .bind(target.id)
    .fetch_optional(pool)
    .await?;

    match existing {
        Some((_, _, status)) if status == "ACCEPTED" => {
            Err(ApiError::conflict("You are already friends."))
        }
        Some((_, requester_id, _)) if requester_id == viewer.id => {
            Err(ApiError::conflict("You have already asked them."))
        }
        Some((id, ..)) => {
            accept_row(pool, id).await?;
            Ok("ACCEPTED")
        }
        None => {
            sqlx::query("INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)")
                .bind(viewer.id)
                .bind(target.id)
                .execute(pool)
                .await?;
            Ok("PENDING")
        }
    }
}

pub async fn accept_request(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<()> {
    let row = find_by_id(pool, id, viewer.id)
        .await?
        .filter(|row| row.status == "PENDING")
        .ok_or_else(|| ApiError::not_found("No such request."))?;

    if row.addressee_id != viewer.id {
        return Err(ApiError::forbidden("Only the person who was asked can accept."));
    }

    accept_row(pool, id).await?;
    Ok(())
}

/// Either side may remove a pending request: the asker withdraws it, the asked declines it.
pub async fn remove_request(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<()> {
    find_by_id(pool, id, viewer.id)
        .await?
        .filter(|row| row.status == "PENDING")
        .ok_or_else(|| ApiError::not_found("No such request."))?;

    delete_row(pool, id).await?;
    Ok(())
}

pub async fn unfriend(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<()> {
    find_by_id(pool, id, viewer.id)
        .await?
        .filter(|row| row.status == "ACCEPTED")
        .ok_or_else(|| ApiError::not_found("No such friend."))?;

    delete_row(pool, id).await?;
    Ok(())
}
