//! The JSON API under /api. The page scripts talk to this; it is also the contract the Angular
//! frontend used, unchanged, so anything that spoke to the old server speaks to this one.

use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{FromRequestParts, Path, Query, State},
    http::{StatusCode, request::Parts},
    routing::{get, patch, post, put},
};
use axum_extra::extract::cookie::CookieJar;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::OnceCell;

use crate::{
    attempts::{self, AnswerInput},
    auth::{self, ApiAdmin, ApiUser, ClientIp, MaybeUser},
    error::{ApiError, ApiResult},
    friends, messages,
    password,
    quizzes::{self, QuestionInput, QuizInput},
    settings::{self, Settings},
    shares,
    state::AppState,
    throttle, users,
    validate::{ApiJson, Fields, is_email, len, password_checks, username_checks},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me))
        // attempts
        .route("/attempts", get(attempt_history).post(start_attempt))
        .route("/attempts/{id}", get(attempt_result).delete(delete_attempt))
        .route("/attempts/{id}/current", get(attempt_current))
        .route("/attempts/{id}/answer", post(attempt_answer))
        .route("/attempts/{id}/finish", post(attempt_finish))
        // friends
        .route("/friends", get(list_friends))
        .route("/friends/requests", get(list_requests).post(request_friend))
        .route("/friends/requests/{id}/accept", post(accept_request))
        .route("/friends/requests/{id}", axum::routing::delete(remove_request))
        .route("/friends/{id}", axum::routing::delete(unfriend))
        // quizzes
        .route("/quizzes/study-fields", get(study_fields))
        .route("/quizzes/subjects", get(subjects))
        .route("/quizzes/public", get(public_quizzes))
        .route("/quizzes", get(own_quizzes).post(create_quiz))
        .route("/quizzes/{id}", get(read_quiz).put(edit_quiz).delete(delete_quiz))
        .route("/quizzes/{id}/visibility", patch(set_visibility))
        .route("/quizzes/{id}/archive", put(archive_quiz).delete(unarchive_quiz))
        .route("/quizzes/{id}/questions", post(add_question))
        .route("/quizzes/{id}/order", patch(reorder))
        .route("/quizzes/{id}/shares", post(share_quiz))
        .route("/questions/{id}", put(edit_question).delete(delete_question))
        .route("/questions/{id}/archive", put(archive_question).delete(unarchive_question))
        .route("/questions/{id}/shares", post(share_question))
        // shares
        .route("/shares", get(list_shared))
        .route("/shares/questions/{id}/copy", post(copy_shared_question))
        .route("/shares/quizzes/{id}", axum::routing::delete(dismiss_quiz))
        .route("/shares/questions/{id}", axum::routing::delete(dismiss_question))
        // the rest
        .route("/messages", post(send_message))
        .route("/settings", get(read_settings).put(write_settings))
        // An unmatched /api path is a 404 in JSON, not a page of HTML with a 200 on it.
        .fallback(|method: axum::http::Method, axum::extract::OriginalUri(uri): axum::extract::OriginalUri| async move {
            ApiError::not_found(format!("No API route for {method} {uri}"))
        })
}

/// A numeric id from the path. Anything else is a 404 rather than a 400: `/quizzes/abc` is a
/// place that does not exist, not a malformed request.
pub struct Id(pub i64);

impl<S: Send + Sync> FromRequestParts<S> for Id {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, ApiError> {
        let Path(raw) = Path::<String>::from_request_parts(parts, state)
            .await
            .map_err(|_| ApiError::not_found("Not found."))?;

        if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) {
            return Err(ApiError::not_found("Not found."));
        }

        raw.parse().map(Self).map_err(|_| ApiError::not_found("Not found."))
    }
}

fn no_content() -> StatusCode {
    StatusCode::NO_CONTENT
}

fn non_blank(value: Option<&String>) -> Option<&str> {
    value.map(|v| v.trim()).filter(|v| !v.is_empty())
}

// --- auth ---------------------------------------------------------------------------------------

#[derive(Serialize)]
struct PublicUser {
    id: i64,
    username: String,
    email: String,
    role: String,
}

#[derive(Deserialize)]
struct LoginBody {
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
}

#[derive(Deserialize)]
struct RegisterBody {
    #[serde(default)]
    username: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    password: String,
}

/// Checked against when the username does not exist, so "no such user" and "wrong password" take
/// the same time. Without it, response latency would tell an attacker which usernames are real.
static UNKNOWN_USER_HASH: OnceCell<String> = OnceCell::const_new();

async fn unknown_user_hash() -> String {
    UNKNOWN_USER_HASH
        .get_or_init(|| async {
            let mut bytes = [0u8; 32];
            rand::fill(&mut bytes[..]);
            password::hash(hex::encode(bytes)).await
        })
        .await
        .clone()
}

async fn register(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    jar: CookieJar,
    ApiJson(body): ApiJson<RegisterBody>,
) -> ApiResult<(StatusCode, CookieJar, Json<PublicUser>)> {
    let username = body.username.trim().to_string();
    let email = body.email.trim().to_string();

    let mut fields = Fields::default();
    username_checks(&mut fields, &username);
    fields.check("email", is_email(&email), "email is not a valid address");
    fields.check("email", len(&email) <= 254, "email must be at most 254 characters");
    password_checks(&mut fields, &body.password);
    fields.finish()?;

    settings::assert_registration_open(&state.pool).await?;
    throttle::assert_signup_allowed(&state.pool, &ip).await?;

    if users::find_by_username(&state.pool, &username).await?.is_some() {
        return Err(ApiError::conflict("That username is taken."));
    }

    if users::find_by_email(&state.pool, &email).await?.is_some() {
        return Err(ApiError::conflict("That email address already has an account."));
    }

    let hashed = password::hash(body.password).await;
    let user = users::insert(&state.pool, &username, &email, &hashed, "USER").await?;

    throttle::record(&state.pool, "SIGNUP", &ip, Some(&username)).await?;
    let jar = auth::create_session(&state, jar, user.id).await?;

    Ok((
        StatusCode::CREATED,
        jar,
        Json(PublicUser { id: user.id, username: user.username, email: user.email, role: user.role }),
    ))
}

async fn login(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    jar: CookieJar,
    ApiJson(body): ApiJson<LoginBody>,
) -> ApiResult<(CookieJar, Json<PublicUser>)> {
    let username = body.username.trim().to_string();

    let mut fields = Fields::default();
    username_checks(&mut fields, &username);
    password_checks(&mut fields, &body.password);
    fields.finish()?;

    throttle::assert_login_allowed(&state.pool, &ip).await?;

    let user = users::find_by_username(&state.pool, &username).await?;

    let stored = match &user {
        Some(user) => user.password_hash.clone(),
        None => unknown_user_hash().await,
    };
    let matches = password::verify(body.password, stored).await;

    let Some(user) = user.filter(|_| matches) else {
        throttle::record(&state.pool, "LOGIN_FAILURE", &ip, Some(&username)).await?;
        // One message for both failures: it must not reveal which half was wrong.
        return Err(ApiError::unauthorized_with("That username and password do not match."));
    };

    throttle::clear_login_failures(&state.pool, &ip).await?;
    let jar = auth::create_session(&state, jar, user.id).await?;

    Ok((jar, Json(PublicUser { id: user.id, username: user.username, email: user.email, role: user.role })))
}

async fn logout(State(state): State<AppState>, jar: CookieJar) -> ApiResult<(CookieJar, StatusCode)> {
    Ok((auth::destroy_session(&state.pool, jar).await?, no_content()))
}

async fn me(ApiUser(user): ApiUser) -> Json<PublicUser> {
    Json(PublicUser { id: user.id, username: user.username, email: user.email, role: user.role })
}

// --- attempts -----------------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartBody {
    quiz_id: i64,
}

async fn attempt_history(State(s): State<AppState>, ApiUser(user): ApiUser) -> ApiResult<Json<Vec<attempts::AttemptSummary>>> {
    Ok(Json(attempts::history(&s.pool, &user).await?))
}

async fn start_attempt(
    State(s): State<AppState>,
    ApiUser(user): ApiUser,
    ApiJson(body): ApiJson<StartBody>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let (attempt_id, total) = attempts::start(&s.pool, &user, body.quiz_id).await?;
    Ok((StatusCode::CREATED, Json(json!({ "attemptId": attempt_id, "total": total }))))
}

async fn attempt_current(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<Json<attempts::Current>> {
    Ok(Json(attempts::current(&s.pool, id, &user).await?))
}

async fn attempt_answer(
    State(s): State<AppState>,
    ApiUser(user): ApiUser,
    Id(id): Id,
    ApiJson(body): ApiJson<AnswerInput>,
) -> ApiResult<Json<attempts::AnswerResult>> {
    attempts::validate_answer(&body)?;
    Ok(Json(attempts::answer(&s.pool, id, &user, &body).await?))
}

async fn attempt_finish(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    attempts::finish(&s.pool, id, &user).await?;
    Ok(no_content())
}

async fn attempt_result(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<Json<attempts::AttemptResult>> {
    Ok(Json(attempts::result(&s.pool, id, &user).await?))
}

async fn delete_attempt(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    attempts::remove(&s.pool, id, &user).await?;
    Ok(no_content())
}

// --- friends ------------------------------------------------------------------------------------

#[derive(Deserialize)]
struct FriendRequestBody {
    #[serde(default)]
    username: String,
}

async fn list_friends(State(s): State<AppState>, ApiUser(user): ApiUser) -> ApiResult<Json<Vec<friends::Friend>>> {
    Ok(Json(friends::list_friends(&s.pool, &user).await?))
}

async fn list_requests(State(s): State<AppState>, ApiUser(user): ApiUser) -> ApiResult<Json<Vec<friends::FriendRequest>>> {
    Ok(Json(friends::list_requests(&s.pool, &user).await?))
}

async fn request_friend(
    State(s): State<AppState>,
    ApiUser(user): ApiUser,
    ApiJson(body): ApiJson<FriendRequestBody>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let username = body.username.trim();

    let mut fields = Fields::default();
    fields.check("username", !username.is_empty(), "username is required");
    fields.check("username", len(username) <= 64, "Too big: expected string to have <=64 characters");
    fields.finish()?;

    let status = friends::request_friend(&s.pool, &user, username).await?;
    Ok((StatusCode::CREATED, Json(json!({ "status": status }))))
}

async fn accept_request(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    friends::accept_request(&s.pool, id, &user).await?;
    Ok(no_content())
}

async fn remove_request(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    friends::remove_request(&s.pool, id, &user).await?;
    Ok(no_content())
}

async fn unfriend(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    friends::unfriend(&s.pool, id, &user).await?;
    Ok(no_content())
}

// --- quizzes ------------------------------------------------------------------------------------

type Params = Query<HashMap<String, String>>;

fn param<'a>(params: &'a HashMap<String, String>, name: &str) -> Option<&'a str> {
    params.get(name).map(|v| v.trim()).filter(|v| !v.is_empty())
}

async fn study_fields(State(s): State<AppState>) -> ApiResult<Json<Vec<quizzes::StudyField>>> {
    Ok(Json(quizzes::list_study_fields(&s.pool).await?))
}

async fn subjects(State(s): State<AppState>, MaybeUser(viewer): MaybeUser, Query(p): Params) -> ApiResult<Json<Vec<String>>> {
    let mine = p.get("scope").is_some_and(|scope| scope == "mine");
    Ok(Json(quizzes::list_subjects(&s.pool, viewer.as_ref(), mine, param(&p, "studyField")).await?))
}

async fn public_quizzes(State(s): State<AppState>, MaybeUser(viewer): MaybeUser, Query(p): Params) -> ApiResult<Json<Vec<quizzes::QuizSummary>>> {
    // Anything unparseable or zero falls back to the default, as `Number(x) || 50` did.
    let limit = p.get("limit").and_then(|v| v.parse::<i64>().ok()).filter(|n| *n != 0).unwrap_or(50).min(100);
    let offset = p.get("offset").and_then(|v| v.parse::<i64>().ok()).unwrap_or(0).max(0);
    let archived = p.get("archived").is_some_and(|v| v == "true");

    Ok(Json(
        quizzes::list_public(&s.pool, viewer.as_ref(), param(&p, "studyField"), param(&p, "subject"), limit, offset, archived)
            .await?,
    ))
}

async fn own_quizzes(State(s): State<AppState>, ApiUser(user): ApiUser, Query(p): Params) -> ApiResult<Json<Vec<quizzes::QuizSummary>>> {
    let archived = p.get("archived").is_some_and(|v| v == "true");
    Ok(Json(quizzes::list_own(&s.pool, &user, param(&p, "studyField"), param(&p, "subject"), archived).await?))
}

async fn create_quiz(State(s): State<AppState>, ApiUser(user): ApiUser, ApiJson(input): ApiJson<QuizInput>) -> ApiResult<(StatusCode, Json<quizzes::QuizDetail>)> {
    Ok((StatusCode::CREATED, Json(quizzes::create_quiz(&s.pool, &user, &input).await?)))
}

async fn read_quiz(State(s): State<AppState>, MaybeUser(viewer): MaybeUser, Id(id): Id) -> ApiResult<Json<quizzes::QuizDetail>> {
    Ok(Json(quizzes::read_quiz(&s.pool, id, viewer.as_ref()).await?))
}

async fn edit_quiz(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id, ApiJson(input): ApiJson<QuizInput>) -> ApiResult<Json<quizzes::QuizDetail>> {
    Ok(Json(quizzes::edit_quiz(&s.pool, id, &user, &input).await?))
}

#[derive(Deserialize)]
struct VisibilityBody {
    visibility: String,
}

async fn set_visibility(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id, ApiJson(body): ApiJson<VisibilityBody>) -> ApiResult<Json<quizzes::QuizDetail>> {
    if body.visibility != "PRIVATE" && body.visibility != "PUBLIC" {
        return Err(ApiError::bad_request_field("That request was not valid.", "visibility", "visibility must be PRIVATE or PUBLIC"));
    }

    Ok(Json(quizzes::set_visibility(&s.pool, id, &user, &body.visibility).await?))
}

async fn delete_quiz(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    quizzes::remove_quiz(&s.pool, id, &user).await?;
    Ok(no_content())
}

async fn archive_quiz(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    quizzes::set_archived(&s.pool, id, &user, true).await?;
    Ok(no_content())
}

async fn unarchive_quiz(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    quizzes::set_archived(&s.pool, id, &user, false).await?;
    Ok(no_content())
}

async fn add_question(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id, ApiJson(input): ApiJson<QuestionInput>) -> ApiResult<(StatusCode, Json<quizzes::QuizDetail>)> {
    Ok((StatusCode::CREATED, Json(quizzes::add_question(&s.pool, id, &user, &input).await?)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderBody {
    question_ids: Vec<i64>,
}

async fn reorder(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id, ApiJson(body): ApiJson<OrderBody>) -> ApiResult<Json<quizzes::QuizDetail>> {
    if body.question_ids.is_empty() {
        return Err(ApiError::bad_request_field("That request was not valid.", "questionIds", "Too small: expected array to have >=1 items"));
    }

    Ok(Json(quizzes::reorder(&s.pool, id, &user, &body.question_ids).await?))
}

async fn edit_question(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id, ApiJson(input): ApiJson<QuestionInput>) -> ApiResult<Json<quizzes::QuizDetail>> {
    Ok(Json(quizzes::edit_question(&s.pool, id, &user, &input).await?))
}

async fn delete_question(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<Json<quizzes::QuizDetail>> {
    Ok(Json(quizzes::remove_question(&s.pool, id, &user).await?))
}

async fn archive_question(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    quizzes::set_question_archived(&s.pool, id, &user, true).await?;
    Ok(no_content())
}

async fn unarchive_question(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    quizzes::set_question_archived(&s.pool, id, &user, false).await?;
    Ok(no_content())
}

// --- shares -------------------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareBody {
    friend_ids: Vec<i64>,
}

fn validate_share(body: &ShareBody) -> ApiResult<()> {
    let mut fields = Fields::default();
    fields.check("friendIds", !body.friend_ids.is_empty(), "choose at least one friend");
    fields.check("friendIds", body.friend_ids.len() <= 50, "Too big: expected array to have <=50 items");
    fields.finish()
}

async fn share_quiz(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id, ApiJson(body): ApiJson<ShareBody>) -> ApiResult<(StatusCode, Json<Value>)> {
    validate_share(&body)?;
    let shared = shares::share_quiz(&s, &user, id, &body.friend_ids).await?;
    Ok((StatusCode::CREATED, Json(json!({ "shared": shared }))))
}

async fn share_question(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id, ApiJson(body): ApiJson<ShareBody>) -> ApiResult<(StatusCode, Json<Value>)> {
    validate_share(&body)?;
    let shared = shares::share_question(&s, &user, id, &body.friend_ids).await?;
    Ok((StatusCode::CREATED, Json(json!({ "shared": shared }))))
}

async fn list_shared(State(s): State<AppState>, ApiUser(user): ApiUser) -> ApiResult<Json<shares::Shared>> {
    Ok(Json(shares::list_shared(&s.pool, &user).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CopyBody {
    quiz_id: i64,
}

async fn copy_shared_question(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id, ApiJson(body): ApiJson<CopyBody>) -> ApiResult<(StatusCode, Json<Value>)> {
    let question_id = shares::copy_shared_question(&s.pool, &user, id, body.quiz_id).await?;
    Ok((StatusCode::CREATED, Json(json!({ "questionId": question_id }))))
}

async fn dismiss_quiz(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    shares::dismiss_quiz(&s.pool, &user, id).await?;
    Ok(no_content())
}

async fn dismiss_question(State(s): State<AppState>, ApiUser(user): ApiUser, Id(id): Id) -> ApiResult<StatusCode> {
    shares::dismiss_question(&s.pool, &user, id).await?;
    Ok(no_content())
}

// --- messages and settings ----------------------------------------------------------------------

#[derive(Deserialize)]
struct MessageBody {
    name: Option<String>,
    email: Option<String>,
    #[serde(default)]
    body: String,
}

async fn send_message(
    State(s): State<AppState>,
    ClientIp(ip): ClientIp,
    ApiJson(request): ApiJson<MessageBody>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let text = request.body.trim();
    let email = non_blank(request.email.as_ref());

    let mut fields = Fields::default();
    fields.check("name", len(request.name.as_deref().unwrap_or_default()) <= 80, "name must be at most 80 characters");
    fields.check("email", email.is_none_or(is_email), "email is not a valid address");
    fields.check("email", email.is_none_or(|e| len(e) <= 254), "Too big: expected string to have <=254 characters");
    fields.check("body", !text.is_empty(), "message is required");
    fields.check("body", len(text) <= 5000, "message must be at most 5000 characters");
    fields.finish()?;

    let (id, created_at) =
        messages::send(&s.pool, &ip, request.name.as_deref(), email, text).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id": id,
            "createdAt": created_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        })),
    ))
}

async fn read_settings(State(s): State<AppState>) -> ApiResult<Json<Settings>> {
    Ok(Json(settings::read(&s.pool).await?))
}

async fn write_settings(State(s): State<AppState>, ApiAdmin(admin): ApiAdmin, ApiJson(body): ApiJson<Settings>) -> ApiResult<Json<Settings>> {
    Ok(Json(settings::write(&s.pool, body, admin.id).await?))
}
