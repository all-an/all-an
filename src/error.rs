use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

/// An error the API reports as JSON: `{ "message": ..., ...details }`.
///
/// Anything that is not one of these is a bug or an outage, and is reported as a bare 500 with the
/// cause logged rather than sent - a stack trace in a response body is a gift to whoever is probing.
#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
    pub details: Map<String, Value>,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self { status, message: message.into(), details: Map::new() }
    }

    pub fn with_detail(mut self, key: &str, value: impl Into<Value>) -> Self {
        self.details.insert(key.to_string(), value.into());
        self
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    /// 400 with a per-field breakdown the forms render under each input.
    pub fn invalid_fields(fields: BTreeMap<String, String>) -> Self {
        Self::bad_request("That request was not valid.").with_detail("fields", json!(fields))
    }

    pub fn bad_request_field(message: impl Into<String>, field: &str, text: &str) -> Self {
        Self::bad_request(message).with_detail("fields", json!({ field: text }))
    }

    pub fn unauthorized() -> Self {
        Self::unauthorized_with("Sign in to do that.")
    }

    pub fn unauthorized_with(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, message)
    }

    pub fn too_many_requests(message: impl Into<String>) -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, message)
    }

    pub fn internal() -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "Something went wrong. Please try again.")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut body = self.details;
        body.insert("message".to_string(), Value::String(self.message));
        (self.status, Json(Value::Object(body))).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        tracing::error!(%error, "database error");
        Self::internal()
    }
}
