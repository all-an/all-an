use chrono::{DateTime, TimeZone, Utc};
use sqlx::PgPool;

use crate::error::{ApiError, ApiResult};

pub const CONTACT_EMAIL: &str = "allan8tech@gmail.com";

/// Midnight UTC today. The limit is "one a day" on the calendar rather than "one per 24 hours", so
/// somebody who wrote at 23:50 can write again at 00:10 - which is what "tomorrow" means to a person.
pub fn start_of_today_utc(now: DateTime<Utc>) -> DateTime<Utc> {
    Utc.from_utc_datetime(&now.date_naive().and_hms_opt(0, 0, 0).expect("midnight exists"))
}

pub fn blank_to_none(value: Option<&str>) -> Option<String> {
    value.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string)
}

pub async fn send(
    pool: &PgPool,
    ip: &str,
    name: Option<&str>,
    email: Option<&str>,
    body: &str,
) -> ApiResult<(i64, DateTime<Utc>)> {
    let (posted_today,): (bool,) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM messages WHERE ip = $1 AND created_at >= $2)",
    )
    .bind(ip)
    .bind(start_of_today_utc(Utc::now()))
    .fetch_one(pool)
    .await?;

    if posted_today {
        return Err(ApiError::too_many_requests("This address has already sent a message today.")
            .with_detail("contactEmail", CONTACT_EMAIL));
    }

    let saved = sqlx::query_as(
        "INSERT INTO messages (ip, name, email, body, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, created_at",
    )
    .bind(ip)
    .bind(blank_to_none(name))
    .bind(blank_to_none(email))
    .bind(body.trim())
    .fetch_one(pool)
    .await?;

    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_starts_at_utc_midnight() {
        let now = Utc.with_ymd_and_hms(2026, 10, 4, 23, 59, 59).unwrap();
        assert_eq!(start_of_today_utc(now), Utc.with_ymd_and_hms(2026, 10, 4, 0, 0, 0).unwrap());
    }

    #[test]
    fn blank_means_absent() {
        assert_eq!(blank_to_none(Some("  ")), None);
        assert_eq!(blank_to_none(None), None);
        assert_eq!(blank_to_none(Some(" a ")), Some("a".to_string()));
    }
}
