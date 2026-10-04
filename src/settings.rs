use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::error::{ApiError, ApiResult};

/// Site-wide switches an administrator can flip. The JSON shape is the contract with the admin page.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub registration_enabled: bool,
}

const REGISTRATION_ENABLED: &str = "registration_enabled";

impl Default for Settings {
    fn default() -> Self {
        Self { registration_enabled: true }
    }
}

/// A value nobody can read falls back to the default rather than failing the request: a typo in
/// the table should not take the sign-in page down.
fn read_bool(value: Option<&str>, fallback: bool) -> bool {
    match value {
        None => fallback,
        Some("true") => true,
        Some("false") => false,
        Some(other) => {
            tracing::warn!("Ignoring unreadable app_settings value {other:?}; using {fallback}.");
            fallback
        }
    }
}

pub async fn read(pool: &PgPool) -> sqlx::Result<Settings> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT key, value FROM app_settings").fetch_all(pool).await?;

    let lookup = |key: &str| rows.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str());

    Ok(Settings {
        registration_enabled: read_bool(
            lookup(REGISTRATION_ENABLED),
            Settings::default().registration_enabled,
        ),
    })
}

pub async fn write(pool: &PgPool, settings: Settings, admin_id: i64) -> sqlx::Result<Settings> {
    sqlx::query(
        "INSERT INTO app_settings (key, value, updated_at, updated_by)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (key) DO UPDATE
         SET value      = EXCLUDED.value,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by",
    )
    .bind(REGISTRATION_ENABLED)
    .bind(settings.registration_enabled.to_string())
    .bind(admin_id)
    .execute(pool)
    .await?;

    Ok(settings)
}

pub async fn assert_registration_open(pool: &PgPool) -> ApiResult<()> {
    if read(pool).await?.registration_enabled {
        Ok(())
    } else {
        Err(ApiError::forbidden("Registration is closed at the moment."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unreadable_values_fall_back() {
        assert!(read_bool(None, true));
        assert!(!read_bool(Some("false"), true));
        assert!(read_bool(Some("yes please"), true));
        assert!(!read_bool(Some("TRUE"), false));
    }
}
