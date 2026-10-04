use std::{str::FromStr, time::Duration};

use include_dir::{Dir, include_dir};
use sha2::{Digest, Sha256};
use sqlx::{
    PgPool,
    postgres::{PgConnectOptions, PgPoolOptions, PgSslMode},
};

/// Compiled into the binary, so a deploy cannot ship code and migrations that disagree.
static MIGRATIONS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/db/migration");

/// Arbitrary, but fixed: every instance asks Postgres for the same advisory lock, so two instances
/// starting at once migrate one after the other instead of racing.
const MIGRATION_LOCK_ID: i64 = 4_120_724;

/// Local and Render-internal hosts speak plain TCP on a private network. Anything else is a public
/// endpoint and gets TLS - required, but not certificate-verified, because managed Postgres hosts
/// commonly present certificates that do not chain to a public CA.
fn ssl_mode(options: &PgConnectOptions) -> PgSslMode {
    let host = options.get_host();
    let is_local = host == "localhost" || host == "127.0.0.1" || host.starts_with('/');
    let is_render_internal = !host.contains('.');

    if is_local || is_render_internal { PgSslMode::Disable } else { PgSslMode::Require }
}

pub async fn connect(url: &str) -> anyhow::Result<PgPool> {
    let options = PgConnectOptions::from_str(url)?;
    let options = options.clone().ssl_mode(ssl_mode(&options));

    Ok(PgPoolOptions::new()
        .max_connections(10)
        .idle_timeout(Duration::from_secs(30))
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(options)
        .await?)
}

struct Migration {
    version: i32,
    name: String,
    sql: String,
    checksum: String,
}

/// `V<number>__<name>.sql`, the Flyway naming the files already use.
fn load_migrations() -> anyhow::Result<Vec<Migration>> {
    let mut migrations = Vec::new();

    for file in MIGRATIONS.files() {
        let file_name = file.path().file_name().and_then(|n| n.to_str()).unwrap_or_default();

        let Some(rest) = file_name.strip_prefix('V').and_then(|r| r.strip_suffix(".sql")) else {
            continue;
        };
        let Some((version, name)) = rest.split_once("__") else {
            continue;
        };
        let Ok(version) = version.parse::<i32>() else {
            continue;
        };

        let sql = file
            .contents_utf8()
            .ok_or_else(|| anyhow::anyhow!("{file_name} is not valid UTF-8"))?
            .to_string();

        // The same SHA-256-of-the-file-text the Node version recorded, so a database migrated by
        // either side is recognised by the other.
        let checksum = hex::encode(Sha256::digest(sql.as_bytes()));

        migrations.push(Migration { version, name: name.to_string(), sql, checksum });
    }

    migrations.sort_by_key(|m| m.version);
    Ok(migrations)
}

/// Applies pending migrations, each in its own transaction. An already-applied migration whose file
/// has since changed is an error: applied migrations are immutable, so edit-in-place is a mistake
/// to be caught here rather than a silent divergence between environments.
pub async fn migrate(pool: &PgPool) -> anyhow::Result<()> {
    let migrations = load_migrations()?;

    // One connection throughout: advisory locks belong to a session, not to a pool.
    let mut conn = pool.acquire().await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS schema_history (
           version     INTEGER PRIMARY KEY,
           name        TEXT NOT NULL,
           checksum    TEXT NOT NULL,
           applied_at  TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT NOW()
         )",
    )
    .execute(&mut *conn)
    .await?;

    sqlx::query("SELECT pg_advisory_lock($1)").bind(MIGRATION_LOCK_ID).execute(&mut *conn).await?;

    let outcome = apply(&mut conn, &migrations).await;

    sqlx::query("SELECT pg_advisory_unlock($1)")
        .bind(MIGRATION_LOCK_ID)
        .execute(&mut *conn)
        .await?;

    outcome
}

async fn apply(conn: &mut sqlx::PgConnection, migrations: &[Migration]) -> anyhow::Result<()> {
    let applied: Vec<(i32, String, String)> =
        sqlx::query_as("SELECT version, checksum, name FROM schema_history")
            .fetch_all(&mut *conn)
            .await?;

    let mut newly_applied = 0;

    for migration in migrations {
        if let Some((_, checksum, name)) = applied.iter().find(|(v, ..)| *v == migration.version) {
            if *checksum != migration.checksum {
                anyhow::bail!(
                    "Migration V{} ({name}) has changed since it was applied. Applied migrations \
                     are immutable - add a new one instead of editing this file.",
                    migration.version
                );
            }
            continue;
        }

        let mut tx = sqlx::Connection::begin(&mut *conn).await?;

        sqlx::raw_sql(sqlx::AssertSqlSafe(migration.sql.as_str())).execute(&mut *tx).await.map_err(|error| {
            anyhow::anyhow!("Migration V{}__{} failed: {error}", migration.version, migration.name)
        })?;

        sqlx::query("INSERT INTO schema_history (version, name, checksum) VALUES ($1, $2, $3)")
            .bind(migration.version)
            .bind(&migration.name)
            .bind(&migration.checksum)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        newly_applied += 1;
        tracing::info!("Applied V{}__{}", migration.version, migration.name);
    }

    tracing::info!(
        "Schema up to date ({} migrations, {newly_applied} newly applied).",
        migrations.len()
    );
    Ok(())
}
