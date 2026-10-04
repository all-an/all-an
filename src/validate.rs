use std::collections::BTreeMap;

use axum::{
    Json,
    extract::{FromRequest, Request},
};
use serde::de::DeserializeOwned;

use crate::error::ApiError;

/// `Json<T>`, except a malformed body is the same 400 the validators produce rather than axum's
/// plain-text 422 - a client has one error shape to handle, not two.
pub struct ApiJson<T>(pub T);

impl<S, T> FromRequest<S> for ApiJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        Json::<T>::from_request(req, state)
            .await
            .map(|Json(value)| Self(value))
            .map_err(|_| ApiError::bad_request("That request was not valid."))
    }
}

/// Collects the first problem per field, in the order they are checked, then turns the lot into one
/// 400. First-wins because the second complaint about a field is usually the same mistake again.
#[derive(Default)]
pub struct Fields(BTreeMap<String, String>);

impl Fields {
    pub fn check(&mut self, field: &str, ok: bool, message: &str) {
        if !ok {
            self.0.entry(field.to_string()).or_insert_with(|| message.to_string());
        }
    }

    pub fn finish(self) -> Result<(), ApiError> {
        if self.0.is_empty() { Ok(()) } else { Err(ApiError::invalid_fields(self.0)) }
    }
}

/// Length in characters, not bytes: "naïve" is five characters whatever it costs in UTF-8.
pub fn len(value: &str) -> usize {
    value.chars().count()
}

pub fn is_email(value: &str) -> bool {
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };

    !local.is_empty()
        && !value.chars().any(char::is_whitespace)
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

pub fn username_checks(fields: &mut Fields, username: &str) {
    fields.check("username", len(username) >= 3, "username must be at least 3 characters");
    fields.check("username", len(username) <= 64, "username must be at most 64 characters");
    fields.check(
        "username",
        username.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'),
        "username may only contain letters, numbers, _ and -",
    );
}

pub fn password_checks(fields: &mut Fields, password: &str) {
    fields.check("password", len(password) >= 8, "password must be at least 8 characters");
    fields.check("password", len(password) <= 200, "password must be at most 200 characters");
}
