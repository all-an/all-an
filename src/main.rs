mod api;
mod attempts;
mod auth;
mod config;
mod db;
mod error;
mod friends;
mod grading;
mod mail;
mod messages;
mod pages;
mod password;
mod quizzes;
mod settings;
mod shares;
mod state;
mod throttle;
mod users;
mod validate;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, StatusCode, header},
    routing::get,
};
use serde_json::{Value, json};
use tower_http::{
    compression::CompressionLayer, services::{ServeDir, ServeFile}, set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use tracing_subscriber::EnvFilter;

use crate::{config::Config, state::AppState};

/// Render polls this to decide whether a deploy is live.
///
/// It checks the database rather than just returning 200, because an instance that cannot reach
/// Postgres can serve no page that matters - reporting it healthy would let a broken deploy
/// replace a working one.
async fn healthz(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    match sqlx::query("SELECT 1").execute(&state.pool).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "ok" }))),
        Err(error) => {
            tracing::error!(%error, "health check failed");
            (StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "status": "unavailable" })))
        }
    }
}

pub fn app(state: AppState) -> Router {
    // Fingerprinting is not worth a build step for a handful of files, so assets get a short
    // cache rather than the year the hashed bundles had: a deploy shows up within the hour.
    let assets = Router::new().fallback_service(ServeDir::new("static")).layer(
        SetResponseHeaderLayer::if_not_present(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=3600"),
        ),
    );

    Router::new()
        .route("/healthz", get(healthz))
        // Browsers ask for these at the root whatever the page says.
        .route_service("/favicon.ico", ServeFile::new("static/favicon.ico"))
        .route_service("/favicon.svg", ServeFile::new("static/favicon.svg"))
        .nest("/api", api::router())
        .nest_service("/static", assets)
        .merge(pages::router())
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // A missing .env is normal (production sets real variables); a broken one is not worth
    // hiding, but dotenvy reports only that it found nothing, so ignore the result.
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn")),
        )
        .init();

    let config = Config::from_env()?;
    let pool = db::connect(&config.database_url).await?;

    // Migrate before listening, never alongside: a request that arrives against a half-migrated
    // schema fails in ways that look like application bugs. Failing here instead means a bad
    // deploy never passes its health check and Render keeps the previous version serving.
    if let Err(error) = db::migrate(&pool).await {
        tracing::error!("Migrations failed; refusing to start: {error:#}");
        std::process::exit(1);
    }

    users::bootstrap_admin(&pool, &config).await?;
    auth::sweep_expired_sessions(&pool).await?;

    let port = config.port;
    let state = AppState {
        pool,
        config: Arc::new(config),
        http: reqwest::Client::builder().timeout(Duration::from_secs(15)).build()?,
    };

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!("all-an listening on http://localhost:{port}");

    axum::serve(listener, app(state).into_make_service_with_connect_info::<SocketAddr>()).await?;

    Ok(())
}
