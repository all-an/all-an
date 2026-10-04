//! Courtesy throttles for signup and login, backed by the auth_events table.
//!
//! These slow a casual attacker down; they are not an audit log and not a defence against a
//! determined one - an attacker with many addresses sidesteps a per-address cap by definition.

use sqlx::PgPool;

use crate::error::{ApiError, ApiResult};

const MAX_SIGNUPS_PER_DAY: i64 = 3;
const MAX_LOGIN_FAILURES: i64 = 5;
const LOGIN_WINDOW_MINUTES: i64 = 15;

pub async fn record(pool: &PgPool, kind: &str, ip: &str, username: Option<&str>) -> ApiResult<()> {
    sqlx::query("INSERT INTO auth_events (ip, username, kind) VALUES ($1, $2, $3)")
        .bind(ip)
        .bind(username)
        .bind(kind)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn assert_signup_allowed(pool: &PgPool, ip: &str) -> ApiResult<()> {
    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM auth_events
         WHERE ip = $1 AND kind = 'SIGNUP' AND created_at >= NOW() - INTERVAL '1 day'",
    )
    .bind(ip)
    .fetch_one(pool)
    .await?;

    if count >= MAX_SIGNUPS_PER_DAY {
        return Err(ApiError::too_many_requests(
            "Too many accounts have been created from this address today.",
        ));
    }

    Ok(())
}

/// Five failures in fifteen minutes locks the address out until the oldest of them ages out of the
/// window - and says how long that is, so a legitimate user who fat-fingered it knows when to
/// come back rather than guessing.
pub async fn assert_login_allowed(pool: &PgPool, ip: &str) -> ApiResult<()> {
    let (count, retry_after): (i64, Option<f64>) = sqlx::query_as(
        "SELECT COUNT(*),
                EXTRACT(EPOCH FROM (MIN(created_at) + make_interval(mins => $2::int) - NOW()))::float8
         FROM auth_events
         WHERE ip = $1 AND kind = 'LOGIN_FAILURE'
           AND created_at >= NOW() - make_interval(mins => $2::int)",
    )
    .bind(ip)
    .bind(LOGIN_WINDOW_MINUTES as i32)
    .fetch_one(pool)
    .await?;

    if count < MAX_LOGIN_FAILURES {
        return Ok(());
    }

    let seconds = retry_after.map_or(1, |s| s.ceil().max(1.0) as i64);

    Err(ApiError::too_many_requests("Too many failed sign-ins from this address. Try again shortly.")
        .with_detail("retryAfterSeconds", seconds))
}

/// A successful sign-in forgives the address's earlier failures.
pub async fn clear_login_failures(pool: &PgPool, ip: &str) -> ApiResult<()> {
    sqlx::query("DELETE FROM auth_events WHERE ip = $1 AND kind = 'LOGIN_FAILURE'")
        .bind(ip)
        .execute(pool)
        .await?;

    Ok(())
}
