use std::net::SocketAddr;

use axum::{
    extract::{ConnectInfo, FromRequestParts},
    http::request::Parts,
    response::{IntoResponse, Redirect, Response},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use time::Duration as CookieDuration;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};

use crate::{error::ApiError, state::AppState};

pub const SESSION_COOKIE: &str = "sid";
const SESSION_TTL_DAYS: i64 = 30;

#[derive(Clone, Debug, FromRow, Serialize)]
pub struct SessionUser {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub role: String,
}

impl SessionUser {
    pub fn is_admin(&self) -> bool {
        self.role == "ADMIN"
    }
}

/// The session id in the database is the SHA-256 of the cookie's token, never the token itself, so
/// a leaked dump of the table contains nothing anyone could present as a cookie.
fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

pub async fn create_session(
    state: &AppState,
    jar: CookieJar,
    user_id: i64,
) -> Result<CookieJar, ApiError> {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};

    let mut bytes = [0u8; 32];
    rand::fill(&mut bytes[..]);
    let token = URL_SAFE_NO_PAD.encode(bytes);

    sqlx::query(
        "INSERT INTO sessions (id, user_id, expires_at)
         VALUES ($1, $2, NOW() + make_interval(days => $3::int))",
    )
    .bind(token_hash(&token))
    .bind(user_id)
    .bind(SESSION_TTL_DAYS as i32)
    .execute(&state.pool)
    .await?;

    let cookie = Cookie::build((SESSION_COOKIE, token))
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.config.session_cookie_secure)
        .path("/")
        .max_age(CookieDuration::days(SESSION_TTL_DAYS))
        .build();

    Ok(jar.add(cookie))
}

pub async fn destroy_session(pool: &PgPool, jar: CookieJar) -> Result<CookieJar, ApiError> {
    if let Some(cookie) = jar.get(SESSION_COOKIE) {
        sqlx::query("DELETE FROM sessions WHERE id = $1")
            .bind(token_hash(cookie.value()))
            .execute(pool)
            .await?;
    }

    Ok(jar.remove(Cookie::build(SESSION_COOKIE).path("/")))
}

pub async fn sweep_expired_sessions(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM sessions WHERE expires_at <= NOW()").execute(pool).await?;
    Ok(())
}

async fn user_for_cookie(pool: &PgPool, jar: &CookieJar) -> Result<Option<SessionUser>, sqlx::Error> {
    let Some(cookie) = jar.get(SESSION_COOKIE) else {
        return Ok(None);
    };

    sqlx::query_as::<_, SessionUser>(
        "SELECT u.id, u.username, u.email, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.expires_at > NOW()",
    )
    .bind(token_hash(cookie.value()))
    .fetch_optional(pool)
    .await
}

/// The signed-in user, if there is one. For endpoints that work either way - browsing, say, which
/// shows archive buttons only to somebody who has an archive.
pub struct MaybeUser(pub Option<SessionUser>);

impl FromRequestParts<AppState> for MaybeUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let jar = CookieJar::from_headers(&parts.headers);
        Ok(Self(user_for_cookie(&state.pool, &jar).await?))
    }
}

/// A signed-in user, or a 401. For the JSON API.
pub struct ApiUser(pub SessionUser);

impl FromRequestParts<AppState> for ApiUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let MaybeUser(user) = MaybeUser::from_request_parts(parts, state).await?;
        user.map(Self).ok_or_else(ApiError::unauthorized)
    }
}

/// An administrator, or a 401/403. Admin-only API endpoints.
pub struct ApiAdmin(pub SessionUser);

impl FromRequestParts<AppState> for ApiAdmin {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let ApiUser(user) = ApiUser::from_request_parts(parts, state).await?;

        if user.is_admin() {
            Ok(Self(user))
        } else {
            Err(ApiError::forbidden("That needs an administrator."))
        }
    }
}

/// Where a page sends somebody who is not allowed in.
pub struct PageRedirect(Response);

impl IntoResponse for PageRedirect {
    fn into_response(self) -> Response {
        self.0
    }
}

fn sign_in_redirect(parts: &Parts) -> PageRedirect {
    let target = parts.uri.path_and_query().map_or("/", |pq| pq.as_str());
    let encoded: String = target
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                (b as char).to_string()
            }
            other => format!("%{other:02X}"),
        })
        .collect();

    PageRedirect(Redirect::to(&format!("/login?next={encoded}")).into_response())
}

/// A signed-in user for a page: anyone else is sent to sign in and brought back afterwards.
pub struct PageUser(pub SessionUser);

impl FromRequestParts<AppState> for PageUser {
    type Rejection = PageRedirect;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, PageRedirect> {
        let jar = CookieJar::from_headers(&parts.headers);

        match user_for_cookie(&state.pool, &jar).await {
            Ok(Some(user)) => Ok(Self(user)),
            Ok(None) => Err(sign_in_redirect(parts)),
            Err(error) => {
                tracing::error!(%error, "session lookup failed");
                Err(PageRedirect(ApiError::internal().into_response()))
            }
        }
    }
}

/// An administrator for a page. A signed-in non-admin goes home; a stranger goes to sign in.
pub struct PageAdmin(pub SessionUser);

impl FromRequestParts<AppState> for PageAdmin {
    type Rejection = PageRedirect;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, PageRedirect> {
        let PageUser(user) = PageUser::from_request_parts(parts, state).await?;

        if user.is_admin() {
            Ok(Self(user))
        } else {
            Err(PageRedirect(Redirect::to("/").into_response()))
        }
    }
}

/// The address the throttles attribute a request to.
///
/// Behind a trusted proxy that is the last entry of X-Forwarded-For - the address the proxy itself
/// saw connecting, which a client cannot forge because the proxy appends it. Earlier entries are
/// whatever the client claimed. Without a trusted proxy the header is ignored entirely.
pub struct ClientIp(pub String);

const MAX_IP_LENGTH: usize = 45; // The longest IPv6 text form, matching the columns that store it.

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let forwarded = state
            .config
            .trust_proxy_headers
            .then(|| parts.headers.get("x-forwarded-for"))
            .flatten()
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.rsplit(',').next())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let ip = match forwarded {
            Some(ip) => ip,
            None => parts
                .extensions
                .get::<ConnectInfo<SocketAddr>>()
                .map_or_else(|| "unknown".to_string(), |ConnectInfo(addr)| addr.ip().to_string()),
        };

        // An IPv4 client on a dual-stack socket shows up as ::ffff:1.2.3.4; one address, one form.
        let ip = ip.strip_prefix("::ffff:").unwrap_or(&ip);

        Ok(Self(ip.chars().take(MAX_IP_LENGTH).collect()))
    }
}
