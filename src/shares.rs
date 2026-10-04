//! Sharing quizzes and single questions with friends, and the recipient's inbox of what has been
//! shared with them.

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};

use crate::{
    auth::SessionUser,
    error::{ApiError, ApiResult},
    friends::are_friends,
    mail::{self, Mail, escape_html},
    quizzes::{self, NewQuestion},
    state::AppState,
    users::{self, UserRow},
};

pub async fn is_quiz_shared_with(pool: &PgPool, quiz_id: i64, user_id: i64) -> sqlx::Result<bool> {
    let (exists,): (bool,) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM quiz_shares WHERE quiz_id = $1 AND shared_with_id = $2)",
    )
    .bind(quiz_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

/// Only friends, and only ones that exist: ids the sender is not friends with are dropped rather
/// than rejected, so a stale picker does not fail a share to the people who are still valid. If
/// that leaves nobody, the sender asked for something they may not do.
async fn friends_among(pool: &PgPool, viewer: &SessionUser, ids: &[i64]) -> ApiResult<Vec<UserRow>> {
    if ids.is_empty() {
        return Err(ApiError::bad_request("Choose at least one friend."));
    }

    let mut allowed = Vec::new();

    for user in users::find_by_ids(pool, ids).await? {
        if are_friends(pool, viewer.id, user.id).await? {
            allowed.push(user);
        }
    }

    if allowed.is_empty() {
        return Err(ApiError::forbidden("You can only share with friends."));
    }

    Ok(allowed)
}

/// Returns how many people it was newly shared with: re-sharing to someone who already has it is
/// a no-op, and does not email them a second time.
pub async fn share_quiz(
    state: &AppState,
    viewer: &SessionUser,
    quiz_id: i64,
    friend_ids: &[i64],
) -> ApiResult<usize> {
    let pool = &state.pool;

    let quiz = quizzes::find_quiz_by_id(pool, quiz_id)
        .await?
        .filter(|quiz| quiz.owner_id == Some(viewer.id))
        .ok_or_else(|| ApiError::not_found("No such quiz."))?;

    if quiz.question_count == 0 {
        return Err(ApiError::bad_request("Add at least one question before sharing."));
    }

    let mut shared = 0;
    let site = &state.config.site_url;

    for recipient in friends_among(pool, viewer, friend_ids).await? {
        let inserted = sqlx::query(
            "INSERT INTO quiz_shares (quiz_id, shared_by_id, shared_with_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (quiz_id, shared_with_id) DO NOTHING",
        )
        .bind(quiz_id)
        .bind(viewer.id)
        .bind(recipient.id)
        .execute(pool)
        .await?
        .rows_affected()
            > 0;

        if !inserted {
            continue;
        }

        shared += 1;

        mail::send(
            &state.config,
            &state.http,
            Mail {
                to: recipient.email,
                subject: format!("{} shared a quiz with you: {}", viewer.username, quiz.title),
                text: format!(
                    "{} shared the quiz \"{}\" ({}) with you on all-an.\n\nTake it here: {site}/quizzes/{quiz_id}/take\n",
                    viewer.username, quiz.title, quiz.subject
                ),
                html: format!(
                    "<p><strong>{}</strong> shared the quiz \"{}\" ({}) with you on all-an.</p>\
                     <p><a href=\"{site}/quizzes/{quiz_id}/take\">Take it here</a></p>",
                    escape_html(&viewer.username),
                    escape_html(&quiz.title),
                    escape_html(&quiz.subject)
                ),
            },
        )
        .await;
    }

    Ok(shared)
}

pub async fn share_question(
    state: &AppState,
    viewer: &SessionUser,
    question_id: i64,
    friend_ids: &[i64],
) -> ApiResult<usize> {
    let pool = &state.pool;
    let not_found = || ApiError::not_found("No such question.");

    let question = quizzes::find_question_by_id(pool, question_id).await?.ok_or_else(not_found)?;
    let quiz = quizzes::find_quiz_by_id(pool, question.quiz_id).await?.ok_or_else(not_found)?;

    if quiz.owner_id != Some(viewer.id) {
        return Err(not_found());
    }

    let mut shared = 0;
    let site = &state.config.site_url;

    for recipient in friends_among(pool, viewer, friend_ids).await? {
        let inserted = sqlx::query(
            "INSERT INTO question_shares (question_id, shared_by_id, shared_with_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (question_id, shared_with_id) DO NOTHING",
        )
        .bind(question_id)
        .bind(viewer.id)
        .bind(recipient.id)
        .execute(pool)
        .await?
        .rows_affected()
            > 0;

        if !inserted {
            continue;
        }

        shared += 1;

        mail::send(
            &state.config,
            &state.http,
            Mail {
                to: recipient.email,
                subject: format!("{} shared a question with you", viewer.username),
                text: format!(
                    "{} shared a question with you on all-an:\n\n\"{}\"\n\nCopy it into one of your quizzes: {site}/shared\n",
                    viewer.username, question.prompt
                ),
                html: format!(
                    "<p><strong>{}</strong> shared a question with you on all-an:</p>\
                     <blockquote>{}</blockquote>\
                     <p><a href=\"{site}/shared\">Copy it into one of your quizzes</a></p>",
                    escape_html(&viewer.username),
                    escape_html(&question.prompt)
                ),
            },
        )
        .await;
    }

    Ok(shared)
}

#[derive(Debug, FromRow)]
struct QuizShareRow {
    id: i64,
    quiz_id: i64,
    quiz_title: String,
    quiz_subject: String,
    study_field_name: String,
    question_count: i64,
    shared_by_username: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct QuestionShareRow {
    id: i64,
    question_id: i64,
    prompt: String,
    kind: String,
    time_limit_seconds: i32,
    shared_by_username: String,
    created_at: DateTime<Utc>,
    copied_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedQuiz {
    pub share_id: i64,
    pub quiz_id: i64,
    pub title: String,
    pub subject: String,
    pub study_field: String,
    pub question_count: i64,
    pub shared_by: String,
    pub shared_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedQuestion {
    pub share_id: i64,
    pub question_id: i64,
    pub prompt: String,
    pub kind: String,
    pub time_limit_seconds: i32,
    pub shared_by: String,
    pub shared_at: String,
    pub copied: bool,
}

#[derive(Debug, Serialize)]
pub struct Shared {
    pub quizzes: Vec<SharedQuiz>,
    pub questions: Vec<SharedQuestion>,
}

pub async fn list_shared(pool: &PgPool, viewer: &SessionUser) -> ApiResult<Shared> {
    let quiz_rows: Vec<QuizShareRow> = sqlx::query_as(
        "SELECT s.id, s.quiz_id, q.title AS quiz_title, q.subject AS quiz_subject,
                f.name AS study_field_name, sender.username AS shared_by_username, s.created_at,
                (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count
         FROM quiz_shares s
         JOIN quizzes q ON q.id = s.quiz_id
         JOIN study_fields f ON f.id = q.study_field_id
         JOIN users sender ON sender.id = s.shared_by_id
         WHERE s.shared_with_id = $1 AND s.dismissed_at IS NULL
         ORDER BY s.created_at DESC",
    )
    .bind(viewer.id)
    .fetch_all(pool)
    .await?;

    let question_rows: Vec<QuestionShareRow> = sqlx::query_as(
        "SELECT s.id, s.question_id, q.prompt, q.kind, q.time_limit_seconds,
                sender.username AS shared_by_username, s.created_at, s.copied_at
         FROM question_shares s
         JOIN questions q ON q.id = s.question_id
         JOIN users sender ON sender.id = s.shared_by_id
         WHERE s.shared_with_id = $1 AND s.dismissed_at IS NULL
         ORDER BY s.created_at DESC",
    )
    .bind(viewer.id)
    .fetch_all(pool)
    .await?;

    let iso = |at: DateTime<Utc>| at.to_rfc3339_opts(SecondsFormat::Millis, true);

    Ok(Shared {
        quizzes: quiz_rows
            .into_iter()
            .map(|row| SharedQuiz {
                share_id: row.id,
                quiz_id: row.quiz_id,
                title: row.quiz_title,
                subject: row.quiz_subject,
                study_field: row.study_field_name,
                question_count: row.question_count,
                shared_by: row.shared_by_username,
                shared_at: iso(row.created_at),
            })
            .collect(),
        questions: question_rows
            .into_iter()
            .map(|row| SharedQuestion {
                share_id: row.id,
                question_id: row.question_id,
                prompt: row.prompt,
                kind: row.kind,
                time_limit_seconds: row.time_limit_seconds,
                shared_by: row.shared_by_username,
                shared_at: iso(row.created_at),
                copied: row.copied_at.is_some(),
            })
            .collect(),
    })
}

/// Copies a shared question - prompt, explanation, timing and every option - onto the end of one
/// of the recipient's own quizzes. The copy is independent: editing it does not touch the original.
pub async fn copy_shared_question(
    pool: &PgPool,
    viewer: &SessionUser,
    share_id: i64,
    target_quiz_id: i64,
) -> ApiResult<i64> {
    let share: (i64,) = sqlx::query_as(
        "SELECT question_id FROM question_shares WHERE id = $1 AND shared_with_id = $2",
    )
    .bind(share_id)
    .bind(viewer.id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::not_found("No such shared question."))?;

    let source = quizzes::find_question_by_id(pool, share.0)
        .await?
        .ok_or_else(|| ApiError::not_found("That question no longer exists."))?;

    quizzes::find_quiz_by_id(pool, target_quiz_id)
        .await?
        .filter(|quiz| quiz.owner_id == Some(viewer.id))
        .ok_or_else(|| ApiError::not_found("No such quiz."))?;

    let options: Vec<(String, bool)> = quizzes::find_options(pool, &[source.id])
        .await?
        .into_iter()
        .map(|o| (o.body, o.is_correct))
        .collect();

    let mut tx = pool.begin().await?;
    let question_id = quizzes::insert_question(
        &mut tx,
        target_quiz_id,
        &NewQuestion {
            kind: &source.kind,
            prompt: &source.prompt,
            explanation: source.explanation.as_deref(),
            time_limit_seconds: source.time_limit_seconds,
        },
    )
    .await?;
    quizzes::replace_options(&mut tx, question_id, &options).await?;
    tx.commit().await?;

    sqlx::query("UPDATE question_shares SET copied_at = NOW() WHERE id = $1")
        .bind(share_id)
        .execute(pool)
        .await?;

    Ok(question_id)
}

/// Dismissing hides the share from the recipient's inbox and nothing else - the row stays, so a
/// quiz they were already sent keeps being takeable by link, and the sender cannot re-send it.
pub async fn dismiss_quiz(pool: &PgPool, viewer: &SessionUser, share_id: i64) -> ApiResult<()> {
    sqlx::query("UPDATE quiz_shares SET dismissed_at = NOW() WHERE id = $1 AND shared_with_id = $2")
        .bind(share_id)
        .bind(viewer.id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn dismiss_question(pool: &PgPool, viewer: &SessionUser, share_id: i64) -> ApiResult<()> {
    sqlx::query(
        "UPDATE question_shares SET dismissed_at = NOW() WHERE id = $1 AND shared_with_id = $2",
    )
    .bind(share_id)
    .bind(viewer.id)
    .execute(pool)
    .await?;

    Ok(())
}
