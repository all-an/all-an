use sqlx::{FromRow, PgPool};

use crate::{config::Config, password};

#[derive(Clone, Debug, FromRow)]
pub struct UserRow {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role: String,
}

const COLUMNS: &str = "id, username, email, password_hash, role";

pub async fn find_by_username(pool: &PgPool, username: &str) -> sqlx::Result<Option<UserRow>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM users WHERE LOWER(username) = LOWER($1)")))
        .bind(username)
        .fetch_optional(pool)
        .await
}

pub async fn find_by_email(pool: &PgPool, email: &str) -> sqlx::Result<Option<UserRow>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM users WHERE LOWER(email) = LOWER($1)")))
        .bind(email)
        .fetch_optional(pool)
        .await
}

pub async fn find_by_ids(pool: &PgPool, ids: &[i64]) -> sqlx::Result<Vec<UserRow>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM users WHERE id = ANY($1)")))
        .bind(ids)
        .fetch_all(pool)
        .await
}

pub async fn insert(
    pool: &PgPool,
    username: &str,
    email: &str,
    password_hash: &str,
    role: &str,
) -> sqlx::Result<UserRow> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "INSERT INTO users (username, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING {COLUMNS}"
    )))
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .bind(role)
    .fetch_one(pool)
    .await
}

/// Creates the administrator named in the environment, if there is one and it does not exist yet.
///
/// The credential lives in the environment rather than in a migration so that it never lands in
/// version control. Safe to run on every start: an existing account is left exactly as it is, so
/// changing ADMIN_PASSWORD later does not rotate the password - do that from the app.
pub async fn bootstrap_admin(pool: &PgPool, config: &Config) -> anyhow::Result<()> {
    let (Some(username), Some(plain)) = (&config.admin_username, &config.admin_password) else {
        return Ok(());
    };

    let Some(email) = &config.admin_email else {
        tracing::warn!("ADMIN_USERNAME is set but ADMIN_EMAIL is not; skipping admin creation.");
        return Ok(());
    };

    if find_by_username(pool, username).await?.is_some() {
        return Ok(());
    }

    let hashed = password::hash(plain.clone()).await;
    insert(pool, username, email, &hashed, "ADMIN").await?;
    tracing::info!("Created administrator \"{username}\".");

    Ok(())
}
