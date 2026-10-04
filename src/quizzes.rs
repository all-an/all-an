//! Quizzes, their questions and options, per-user archives, and the study-field taxonomy.
//!
//! Persistence and rules live together here: the rules are mostly "who may touch this row", which
//! is a question about the row, and splitting them would just mean passing the same ids between
//! two files.

use std::collections::HashSet;

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgConnection, PgPool};

use crate::{
    auth::SessionUser,
    error::{ApiError, ApiResult},
    shares,
    validate::{Fields, len},
};

#[derive(Clone, Debug, FromRow)]
pub struct QuizRow {
    pub id: i64,
    pub owner_id: Option<i64>,
    pub title: String,
    pub description: Option<String>,
    pub study_field_id: i16,
    pub study_field_slug: String,
    pub study_field_name: String,
    pub subject: String,
    pub visibility: String,
    pub default_time_limit_seconds: i32,
    pub shuffle_questions: bool,
    pub created_at: DateTime<Utc>,
    pub question_count: i64,
    pub archived: bool,
}

#[derive(Clone, Debug, FromRow)]
pub struct QuestionRow {
    pub id: i64,
    pub quiz_id: i64,
    pub position: i16,
    pub kind: String,
    pub prompt: String,
    pub explanation: Option<String>,
    pub time_limit_seconds: i32,
}

#[derive(Clone, Debug, FromRow)]
pub struct OptionRow {
    pub id: i64,
    pub question_id: i64,
    pub body: String,
    pub is_correct: bool,
}

const QUIZ_COLUMNS: &str = "
  q.id, q.owner_id, q.title, q.description, q.study_field_id,
  f.slug AS study_field_slug, f.name AS study_field_name,
  q.subject, q.visibility, q.default_time_limit_seconds, q.shuffle_questions, q.created_at,
  (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count";

/// For lookups that are not about anyone's archive. `archived` is a constant so the row type is
/// the same either way.
fn quiz_select() -> String {
    format!(
        "SELECT {QUIZ_COLUMNS}, FALSE AS archived
         FROM quizzes q JOIN study_fields f ON f.id = q.study_field_id"
    )
}

/// For lists, where $1 is the viewer and `archived` says whether they have set the quiz aside.
fn quiz_select_with_archive() -> String {
    format!(
        "SELECT {QUIZ_COLUMNS},
                EXISTS (SELECT 1 FROM quiz_archives za
                        WHERE za.quiz_id = q.id AND za.user_id = $1) AS archived
         FROM quizzes q JOIN study_fields f ON f.id = q.study_field_id"
    )
}

pub async fn find_quiz_by_id(pool: &PgPool, id: i64) -> sqlx::Result<Option<QuizRow>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!("{} WHERE q.id = $1", quiz_select())))
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn find_quizzes_by_owner(
    pool: &PgPool,
    owner_id: i64,
    study_field: Option<&str>,
    subject: Option<&str>,
    archived: bool,
) -> sqlx::Result<Vec<QuizRow>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "{} WHERE q.owner_id = $1
           AND ($2::text IS NULL OR f.slug = $2)
           AND ($3::text IS NULL OR q.subject = $3)
           AND EXISTS (SELECT 1 FROM quiz_archives za
                       WHERE za.quiz_id = q.id AND za.user_id = $1) = $4
         ORDER BY q.created_at DESC",
        quiz_select_with_archive()
    )))
    .bind(owner_id)
    .bind(study_field)
    .bind(subject)
    .bind(archived)
    .fetch_all(pool)
    .await
}

/// Published quizzes with at least one question: a quiz nobody can take is not worth listing.
pub async fn find_public_quizzes(
    pool: &PgPool,
    viewer_id: Option<i64>,
    study_field: Option<&str>,
    subject: Option<&str>,
    limit: i64,
    offset: i64,
    archived: bool,
) -> sqlx::Result<Vec<QuizRow>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "{} WHERE q.visibility = 'PUBLIC'
           AND ($2::text IS NULL OR f.slug = $2)
           AND ($3::text IS NULL OR q.subject = $3)
           AND EXISTS (SELECT 1 FROM questions WHERE quiz_id = q.id)
           AND EXISTS (SELECT 1 FROM quiz_archives za
                       WHERE za.quiz_id = q.id AND za.user_id = $1) = $6
         ORDER BY q.created_at DESC
         LIMIT $4 OFFSET $5",
        quiz_select_with_archive()
    )))
    .bind(viewer_id)
    .bind(study_field)
    .bind(subject)
    .bind(limit)
    .bind(offset)
    .bind(archived)
    .fetch_all(pool)
    .await
}

struct QuizFields {
    title: String,
    description: Option<String>,
    study_field_id: i16,
    subject: String,
    default_time_limit_seconds: i32,
    shuffle_questions: bool,
}

async fn insert_quiz(pool: &PgPool, owner_id: i64, f: &QuizFields) -> sqlx::Result<i64> {
    let (id,): (i64,) = sqlx::query_as(
        "INSERT INTO quizzes
           (owner_id, title, description, study_field_id, subject,
            default_time_limit_seconds, shuffle_questions)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id",
    )
    .bind(owner_id)
    .bind(&f.title)
    .bind(&f.description)
    .bind(f.study_field_id)
    .bind(&f.subject)
    .bind(f.default_time_limit_seconds)
    .bind(f.shuffle_questions)
    .fetch_one(pool)
    .await?;

    Ok(id)
}

async fn update_quiz(pool: &PgPool, id: i64, f: &QuizFields) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE quizzes
         SET title = $2, description = $3, study_field_id = $4, subject = $5,
             default_time_limit_seconds = $6, shuffle_questions = $7, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(&f.title)
    .bind(&f.description)
    .bind(f.study_field_id)
    .bind(&f.subject)
    .bind(f.default_time_limit_seconds)
    .bind(f.shuffle_questions)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn find_questions(pool: &PgPool, quiz_id: i64) -> sqlx::Result<Vec<QuestionRow>> {
    sqlx::query_as(
        "SELECT id, quiz_id, position, kind, prompt, explanation, time_limit_seconds
         FROM questions WHERE quiz_id = $1 ORDER BY position",
    )
    .bind(quiz_id)
    .fetch_all(pool)
    .await
}

pub async fn find_question_by_id(pool: &PgPool, id: i64) -> sqlx::Result<Option<QuestionRow>> {
    sqlx::query_as(
        "SELECT id, quiz_id, position, kind, prompt, explanation, time_limit_seconds
         FROM questions WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn find_options(pool: &PgPool, question_ids: &[i64]) -> sqlx::Result<Vec<OptionRow>> {
    if question_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as(
        "SELECT id, question_id, position, body, is_correct
         FROM question_options WHERE question_id = ANY($1) ORDER BY question_id, position",
    )
    .bind(question_ids)
    .fetch_all(pool)
    .await
}

pub struct NewQuestion<'a> {
    pub kind: &'a str,
    pub prompt: &'a str,
    pub explanation: Option<&'a str>,
    pub time_limit_seconds: i32,
}

/// Appends to the end: position is one past the current maximum, so two questions added in a row
/// never collide on the (quiz_id, position) unique constraint.
pub async fn insert_question(
    conn: &mut PgConnection,
    quiz_id: i64,
    q: &NewQuestion<'_>,
) -> sqlx::Result<i64> {
    let (id,): (i64,) = sqlx::query_as(
        "INSERT INTO questions (quiz_id, position, kind, prompt, explanation, time_limit_seconds)
         VALUES ($1, COALESCE((SELECT MAX(position) + 1 FROM questions WHERE quiz_id = $1), 1),
                 $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(quiz_id)
    .bind(q.kind)
    .bind(q.prompt)
    .bind(q.explanation)
    .bind(q.time_limit_seconds)
    .fetch_one(conn)
    .await?;

    Ok(id)
}

async fn update_question_fields(
    conn: &mut PgConnection,
    id: i64,
    q: &NewQuestion<'_>,
) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE questions SET kind = $2, prompt = $3, explanation = $4, time_limit_seconds = $5
         WHERE id = $1",
    )
    .bind(id)
    .bind(q.kind)
    .bind(q.prompt)
    .bind(q.explanation)
    .bind(q.time_limit_seconds)
    .execute(conn)
    .await?;

    Ok(())
}

/// Replaces a question's options wholesale. Editing is delete-and-reinsert because option ids are
/// not something the client holds on to - a finished attempt keeps its own snapshot of what was
/// asked, so renumbering here rewrites no history.
pub async fn replace_options(
    conn: &mut PgConnection,
    question_id: i64,
    options: &[(String, bool)],
) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM question_options WHERE question_id = $1")
        .bind(question_id)
        .execute(&mut *conn)
        .await?;

    for (index, (body, is_correct)) in options.iter().enumerate() {
        sqlx::query(
            "INSERT INTO question_options (question_id, position, body, is_correct)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(question_id)
        .bind((index + 1) as i16)
        .bind(body)
        .bind(is_correct)
        .execute(&mut *conn)
        .await?;
    }

    Ok(())
}

/// Parks every question at a negative position, then flips them all positive. Writing the final
/// positions directly would trip the (quiz_id, position) unique constraint partway through - two
/// rows briefly claiming the same slot - which a deferred constraint would avoid but this does not need.
async fn reorder_questions(
    conn: &mut PgConnection,
    quiz_id: i64,
    question_ids: &[i64],
) -> sqlx::Result<()> {
    for (index, id) in question_ids.iter().enumerate() {
        sqlx::query("UPDATE questions SET position = $3 WHERE id = $1 AND quiz_id = $2")
            .bind(id)
            .bind(quiz_id)
            .bind(-((index + 1) as i16))
            .execute(&mut *conn)
            .await?;
    }

    sqlx::query("UPDATE questions SET position = -position WHERE quiz_id = $1 AND position < 0")
        .bind(quiz_id)
        .execute(conn)
        .await?;

    Ok(())
}

pub async fn find_archived_question_ids(
    pool: &PgPool,
    user_id: i64,
    question_ids: &[i64],
) -> sqlx::Result<HashSet<i64>> {
    if question_ids.is_empty() {
        return Ok(HashSet::new());
    }

    let rows: Vec<(i64,)> = sqlx::query_as(
        "SELECT question_id FROM question_archives WHERE user_id = $1 AND question_id = ANY($2)",
    )
    .bind(user_id)
    .bind(question_ids)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|(id,)| id).collect())
}

#[derive(Debug, FromRow)]
pub struct StudyFieldRow {
    pub id: i16,
    pub slug: String,
    pub name: String,
    pub public_quiz_count: i64,
}

pub async fn find_study_fields(pool: &PgPool) -> sqlx::Result<Vec<StudyFieldRow>> {
    sqlx::query_as(
        "SELECT f.id, f.slug, f.name,
                COUNT(q.id) FILTER (
                  WHERE q.visibility = 'PUBLIC'
                    AND EXISTS (SELECT 1 FROM questions WHERE quiz_id = q.id)
                ) AS public_quiz_count
         FROM study_fields f
         LEFT JOIN quizzes q ON q.study_field_id = f.id
         GROUP BY f.id, f.slug, f.name, f.position
         ORDER BY f.position",
    )
    .fetch_all(pool)
    .await
}

async fn study_field_exists(pool: &PgPool, id: i64) -> sqlx::Result<bool> {
    let (exists,): (bool,) =
        sqlx::query_as("SELECT EXISTS (SELECT 1 FROM study_fields WHERE id = $1)")
            .bind(id)
            .fetch_one(pool)
            .await?;

    Ok(exists)
}

async fn find_public_subjects(pool: &PgPool, study_field: Option<&str>) -> sqlx::Result<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT q.subject
         FROM quizzes q
         JOIN study_fields f ON f.id = q.study_field_id
         WHERE q.visibility = 'PUBLIC'
           AND ($1::text IS NULL OR f.slug = $1)
           AND EXISTS (SELECT 1 FROM questions WHERE quiz_id = q.id)
         ORDER BY q.subject",
    )
    .bind(study_field)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|(s,)| s).collect())
}

async fn find_own_subjects(pool: &PgPool, owner_id: i64) -> sqlx::Result<Vec<String>> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT DISTINCT subject FROM quizzes WHERE owner_id = $1 ORDER BY subject")
            .bind(owner_id)
            .fetch_all(pool)
            .await?;

    Ok(rows.into_iter().map(|(s,)| s).collect())
}

// --- the JSON the API speaks --------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct StudyFieldRef {
    pub slug: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizSummary {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub subject: String,
    pub study_field: StudyFieldRef,
    pub visibility: String,
    pub question_count: i64,
    pub created_at: String,
    pub owned: bool,
    pub archived: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionDetail {
    pub id: i64,
    pub body: String,
    pub is_correct: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionDetail {
    pub id: i64,
    pub position: i16,
    pub kind: String,
    pub prompt: String,
    pub explanation: Option<String>,
    pub time_limit_seconds: i32,
    pub archived: bool,
    pub options: Vec<OptionDetail>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizDetail {
    #[serde(flatten)]
    pub summary: QuizSummary,
    pub study_field_id: i16,
    pub default_time_limit_seconds: i32,
    pub shuffle_questions: bool,
    /// Only the author is sent these: the answers are in here.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub questions: Option<Vec<QuestionDetail>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyField {
    pub id: i16,
    pub slug: String,
    pub name: String,
    pub public_quiz_count: i64,
}

pub fn to_summary(row: &QuizRow, viewer_id: Option<i64>) -> QuizSummary {
    QuizSummary {
        id: row.id,
        title: row.title.clone(),
        description: row.description.clone(),
        subject: row.subject.clone(),
        study_field: StudyFieldRef {
            slug: row.study_field_slug.clone(),
            name: row.study_field_name.clone(),
        },
        visibility: row.visibility.clone(),
        question_count: row.question_count,
        created_at: row.created_at.to_rfc3339_opts(SecondsFormat::Millis, true),
        owned: row.owner_id.is_some() && row.owner_id == viewer_id,
        archived: row.archived,
    }
}

// --- access rules -------------------------------------------------------------------------------

/// A quiz the viewer may see: published, their own, or shared with them. Anything else is a 404
/// rather than a 403, so a private quiz's existence is not confirmed to people who cannot read it.
async fn readable(pool: &PgPool, id: i64, viewer: Option<&SessionUser>) -> ApiResult<QuizRow> {
    let row = find_quiz_by_id(pool, id).await?.ok_or_else(|| ApiError::not_found("No such quiz."))?;

    if row.visibility == "PUBLIC" {
        return Ok(row);
    }

    if let Some(viewer) = viewer {
        if row.owner_id == Some(viewer.id) || shares::is_quiz_shared_with(pool, id, viewer.id).await? {
            return Ok(row);
        }
    }

    Err(ApiError::not_found("No such quiz."))
}

/// A quiz the viewer may change: their own, or - for an administrator - any published one, so a
/// bad public quiz can be taken down. Seeded quizzes have no owner, so only an administrator
/// reaches them, and only to remove them.
async fn writable(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<QuizRow> {
    let row = find_quiz_by_id(pool, id).await?.ok_or_else(|| ApiError::not_found("No such quiz."))?;

    if row.owner_id == Some(viewer.id) || (viewer.is_admin() && row.visibility == "PUBLIC") {
        return Ok(row);
    }

    Err(ApiError::not_found("No such quiz."))
}

/// Editing is the author's alone, even for an administrator who may delete.
async fn authored(pool: &PgPool, id: i64, viewer: &SessionUser, action: &str) -> ApiResult<QuizRow> {
    let row = writable(pool, id, viewer).await?;

    if row.owner_id != Some(viewer.id) {
        return Err(ApiError::forbidden(format!("Only the author can {action}.")));
    }

    Ok(row)
}

// --- reading ------------------------------------------------------------------------------------

pub async fn list_study_fields(pool: &PgPool) -> ApiResult<Vec<StudyField>> {
    Ok(find_study_fields(pool)
        .await?
        .into_iter()
        .map(|row| StudyField {
            id: row.id,
            slug: row.slug,
            name: row.name,
            public_quiz_count: row.public_quiz_count,
        })
        .collect())
}

pub async fn list_subjects(
    pool: &PgPool,
    viewer: Option<&SessionUser>,
    mine: bool,
    study_field: Option<&str>,
) -> ApiResult<Vec<String>> {
    Ok(match viewer {
        Some(viewer) if mine => find_own_subjects(pool, viewer.id).await?,
        _ => find_public_subjects(pool, study_field).await?,
    })
}

pub async fn list_own(
    pool: &PgPool,
    viewer: &SessionUser,
    study_field: Option<&str>,
    subject: Option<&str>,
    archived: bool,
) -> ApiResult<Vec<QuizSummary>> {
    let rows = find_quizzes_by_owner(pool, viewer.id, study_field, subject, archived).await?;
    Ok(rows.iter().map(|row| to_summary(row, Some(viewer.id))).collect())
}

pub async fn list_public(
    pool: &PgPool,
    viewer: Option<&SessionUser>,
    study_field: Option<&str>,
    subject: Option<&str>,
    limit: i64,
    offset: i64,
    archived: bool,
) -> ApiResult<Vec<QuizSummary>> {
    let viewer_id = viewer.map(|v| v.id);
    let rows =
        find_public_quizzes(pool, viewer_id, study_field, subject, limit, offset, archived).await?;
    Ok(rows.iter().map(|row| to_summary(row, viewer_id)).collect())
}

pub async fn read_quiz(pool: &PgPool, id: i64, viewer: Option<&SessionUser>) -> ApiResult<QuizDetail> {
    let row = readable(pool, id, viewer).await?;
    let summary = to_summary(&row, viewer.map(|v| v.id));
    let owned = summary.owned;

    let mut detail = QuizDetail {
        summary,
        study_field_id: row.study_field_id,
        default_time_limit_seconds: row.default_time_limit_seconds,
        shuffle_questions: row.shuffle_questions,
        questions: None,
    };

    if !owned {
        return Ok(detail);
    }

    let questions = find_questions(pool, id).await?;
    let ids: Vec<i64> = questions.iter().map(|q| q.id).collect();
    let options = find_options(pool, &ids).await?;
    let archived = match row.owner_id {
        Some(owner) => find_archived_question_ids(pool, owner, &ids).await?,
        None => HashSet::new(),
    };

    detail.questions = Some(
        questions
            .into_iter()
            .map(|q| QuestionDetail {
                id: q.id,
                position: q.position,
                kind: q.kind,
                prompt: q.prompt,
                explanation: q.explanation,
                time_limit_seconds: q.time_limit_seconds,
                archived: archived.contains(&q.id),
                options: options
                    .iter()
                    .filter(|o| o.question_id == q.id)
                    .map(|o| OptionDetail { id: o.id, body: o.body.clone(), is_correct: o.is_correct })
                    .collect(),
            })
            .collect(),
    );

    Ok(detail)
}

// --- writing quizzes ----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizInput {
    #[serde(default)]
    pub title: String,
    pub description: Option<String>,
    pub study_field_id: Option<i64>,
    #[serde(default)]
    pub subject: String,
    pub default_time_limit_seconds: Option<i64>,
    #[serde(default)]
    pub shuffle_questions: bool,
}

fn time_limit_checks(fields: &mut Fields, field: &str, value: i64) {
    fields.check(field, value >= 5, "the time limit must be at least 5 seconds");
    fields.check(field, value <= 600, "the time limit must be at most 10 minutes");
}

/// Validates and normalises in one step, so nothing downstream sees untrimmed text.
fn quiz_fields(input: &QuizInput) -> ApiResult<QuizFields> {
    let title = input.title.trim();
    let subject = input.subject.trim();
    let description = input.description.as_deref().unwrap_or_default();
    let limit = input.default_time_limit_seconds.unwrap_or(30);

    let mut fields = Fields::default();
    fields.check("title", !title.is_empty(), "title is required");
    fields.check("title", len(title) <= 120, "title must be at most 120 characters");
    fields.check("description", len(description) <= 2000, "description must be at most 2000 characters");
    fields.check("studyFieldId", input.study_field_id.is_some(), "pick a study field");
    fields.check("subject", !subject.is_empty(), "subject is required");
    fields.check("subject", len(subject) <= 64, "subject must be at most 64 characters");
    time_limit_checks(&mut fields, "defaultTimeLimitSeconds", limit);
    fields.finish()?;

    Ok(QuizFields {
        title: title.to_string(),
        description: Some(description.trim().to_string()).filter(|d| !d.is_empty()),
        study_field_id: i16::try_from(input.study_field_id.unwrap_or_default()).unwrap_or(i16::MAX),
        subject: subject.to_string(),
        default_time_limit_seconds: limit as i32,
        shuffle_questions: input.shuffle_questions,
    })
}

async fn assert_study_field(pool: &PgPool, id: i64) -> ApiResult<()> {
    if study_field_exists(pool, id).await? {
        Ok(())
    } else {
        Err(ApiError::bad_request_field(
            "That study field does not exist.",
            "studyFieldId",
            "Pick a study field from the list.",
        ))
    }
}

pub async fn create_quiz(pool: &PgPool, viewer: &SessionUser, input: &QuizInput) -> ApiResult<QuizDetail> {
    let fields = quiz_fields(input)?;
    assert_study_field(pool, i64::from(fields.study_field_id)).await?;

    let id = insert_quiz(pool, viewer.id, &fields).await?;
    read_quiz(pool, id, Some(viewer)).await
}

pub async fn edit_quiz(
    pool: &PgPool,
    id: i64,
    viewer: &SessionUser,
    input: &QuizInput,
) -> ApiResult<QuizDetail> {
    authored(pool, id, viewer, "edit a quiz").await?;

    let fields = quiz_fields(input)?;
    assert_study_field(pool, i64::from(fields.study_field_id)).await?;
    update_quiz(pool, id, &fields).await?;

    read_quiz(pool, id, Some(viewer)).await
}

pub async fn set_visibility(
    pool: &PgPool,
    id: i64,
    viewer: &SessionUser,
    visibility: &str,
) -> ApiResult<QuizDetail> {
    let row = authored(pool, id, viewer, "publish or unpublish a quiz").await?;

    if visibility == "PUBLIC" && row.question_count == 0 {
        return Err(ApiError::bad_request("Add at least one question before publishing."));
    }

    sqlx::query("UPDATE quizzes SET visibility = $2, updated_at = NOW() WHERE id = $1")
        .bind(id)
        .bind(visibility)
        .execute(pool)
        .await?;

    read_quiz(pool, id, Some(viewer)).await
}

pub async fn remove_quiz(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<()> {
    writable(pool, id, viewer).await?;

    sqlx::query("DELETE FROM quizzes WHERE id = $1").bind(id).execute(pool).await?;
    Ok(())
}

/// Archiving is personal: it hides the quiz from this viewer's lists and nobody else's, which is
/// why anyone who can read a quiz can archive it.
pub async fn set_archived(
    pool: &PgPool,
    id: i64,
    viewer: &SessionUser,
    archived: bool,
) -> ApiResult<()> {
    readable(pool, id, Some(viewer)).await?;

    if archived {
        sqlx::query(
            "INSERT INTO quiz_archives (user_id, quiz_id) VALUES ($1, $2)
             ON CONFLICT (user_id, quiz_id) DO NOTHING",
        )
        .bind(viewer.id)
        .bind(id)
        .execute(pool)
        .await?;
    } else {
        sqlx::query("DELETE FROM quiz_archives WHERE user_id = $1 AND quiz_id = $2")
            .bind(viewer.id)
            .bind(id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

// --- writing questions --------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionInput {
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub is_correct: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionInput {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub prompt: String,
    pub explanation: Option<String>,
    pub time_limit_seconds: Option<i64>,
    #[serde(default)]
    pub options: Vec<OptionInput>,
}

/// What a question needs to be answerable: at least two choices and a marked answer for multiple
/// choice; at least one accepted spelling for typed. Typed options are all "correct" by definition -
/// each is an answer that will be accepted.
fn normalise_options(input: &QuestionInput) -> ApiResult<Vec<(String, bool)>> {
    let options: Vec<(String, bool)> = input
        .options
        .iter()
        .map(|o| (o.body.trim().to_string(), o.is_correct))
        .filter(|(body, _)| !body.is_empty())
        .collect();

    if input.kind == "MULTIPLE_CHOICE" {
        if options.len() < 2 {
            return Err(ApiError::bad_request_field(
                "A multiple-choice question needs at least two choices.",
                "options",
                "Add at least two choices.",
            ));
        }

        if !options.iter().any(|(_, correct)| *correct) {
            return Err(ApiError::bad_request_field(
                "Mark which choice is correct.",
                "options",
                "Mark at least one choice as correct.",
            ));
        }

        return Ok(options);
    }

    if options.is_empty() {
        return Err(ApiError::bad_request_field(
            "A typed question needs at least one accepted answer.",
            "options",
            "Add the answer you will accept.",
        ));
    }

    Ok(options.into_iter().map(|(body, _)| (body, true)).collect())
}

struct ValidQuestion {
    kind: String,
    prompt: String,
    explanation: Option<String>,
    time_limit: Option<i32>,
    options: Vec<(String, bool)>,
}

fn validate_question(input: &QuestionInput) -> ApiResult<ValidQuestion> {
    let prompt = input.prompt.trim();
    let explanation = input.explanation.as_deref().unwrap_or_default();

    let mut fields = Fields::default();
    fields.check("kind", matches!(input.kind.as_str(), "MULTIPLE_CHOICE" | "TYPED"), "pick a question type");
    fields.check("prompt", !prompt.is_empty(), "the question is required");
    fields.check("prompt", len(prompt) <= 2000, "the question must be at most 2000 characters");
    fields.check("explanation", len(explanation) <= 2000, "the explanation must be at most 2000 characters");
    fields.check("options", input.options.len() <= 10, "at most 10 answers");
    fields.check(
        "options",
        input.options.iter().all(|o| len(o.body.trim()) <= 1000),
        "an answer must be at most 1000 characters",
    );
    if let Some(limit) = input.time_limit_seconds {
        time_limit_checks(&mut fields, "timeLimitSeconds", limit);
    }
    fields.finish()?;

    Ok(ValidQuestion {
        kind: input.kind.clone(),
        prompt: prompt.to_string(),
        explanation: Some(explanation.trim().to_string()).filter(|e| !e.is_empty()),
        time_limit: input.time_limit_seconds.map(|l| l as i32),
        options: normalise_options(input)?,
    })
}

pub async fn add_question(
    pool: &PgPool,
    quiz_id: i64,
    viewer: &SessionUser,
    input: &QuestionInput,
) -> ApiResult<QuizDetail> {
    let quiz = authored(pool, quiz_id, viewer, "add questions").await?;
    let valid = validate_question(input)?;

    let mut tx = pool.begin().await?;
    let question_id = insert_question(
        &mut tx,
        quiz_id,
        &NewQuestion {
            kind: &valid.kind,
            prompt: &valid.prompt,
            explanation: valid.explanation.as_deref(),
            time_limit_seconds: valid.time_limit.unwrap_or(quiz.default_time_limit_seconds),
        },
    )
    .await?;
    replace_options(&mut tx, question_id, &valid.options).await?;
    tx.commit().await?;

    read_quiz(pool, quiz_id, Some(viewer)).await
}

/// A question the viewer authored, with the quiz it belongs to. Anything else is a 404: a
/// question in somebody else's quiz does not exist as far as this viewer is concerned.
async fn owned_question(
    pool: &PgPool,
    question_id: i64,
    viewer: &SessionUser,
) -> ApiResult<(QuestionRow, QuizRow)> {
    let not_found = || ApiError::not_found("No such question.");

    let question = find_question_by_id(pool, question_id).await?.ok_or_else(not_found)?;
    let quiz = find_quiz_by_id(pool, question.quiz_id).await?.ok_or_else(not_found)?;

    if quiz.owner_id != Some(viewer.id) {
        return Err(not_found());
    }

    Ok((question, quiz))
}

pub async fn edit_question(
    pool: &PgPool,
    question_id: i64,
    viewer: &SessionUser,
    input: &QuestionInput,
) -> ApiResult<QuizDetail> {
    let (question, quiz) = owned_question(pool, question_id, viewer).await?;
    let valid = validate_question(input)?;

    let mut tx = pool.begin().await?;
    update_question_fields(
        &mut tx,
        question_id,
        &NewQuestion {
            kind: &valid.kind,
            prompt: &valid.prompt,
            explanation: valid.explanation.as_deref(),
            time_limit_seconds: valid.time_limit.unwrap_or(quiz.default_time_limit_seconds),
        },
    )
    .await?;
    replace_options(&mut tx, question_id, &valid.options).await?;
    tx.commit().await?;

    read_quiz(pool, question.quiz_id, Some(viewer)).await
}

pub async fn remove_question(
    pool: &PgPool,
    question_id: i64,
    viewer: &SessionUser,
) -> ApiResult<QuizDetail> {
    let (question, _) = owned_question(pool, question_id, viewer).await?;

    sqlx::query("DELETE FROM questions WHERE id = $1").bind(question_id).execute(pool).await?;

    read_quiz(pool, question.quiz_id, Some(viewer)).await
}

pub async fn set_question_archived(
    pool: &PgPool,
    question_id: i64,
    viewer: &SessionUser,
    archived: bool,
) -> ApiResult<()> {
    let question = find_question_by_id(pool, question_id)
        .await?
        .ok_or_else(|| ApiError::not_found("No such question."))?;

    readable(pool, question.quiz_id, Some(viewer)).await?;

    if archived {
        sqlx::query(
            "INSERT INTO question_archives (user_id, question_id) VALUES ($1, $2)
             ON CONFLICT (user_id, question_id) DO NOTHING",
        )
        .bind(viewer.id)
        .bind(question_id)
        .execute(pool)
        .await?;
    } else {
        sqlx::query("DELETE FROM question_archives WHERE user_id = $1 AND question_id = $2")
            .bind(viewer.id)
            .bind(question_id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

/// The new order must be a permutation of the quiz's questions: no omissions, no repeats, nothing
/// from elsewhere. Anything looser would let a stale client silently drop or duplicate a question.
pub async fn reorder(
    pool: &PgPool,
    quiz_id: i64,
    viewer: &SessionUser,
    question_ids: &[i64],
) -> ApiResult<QuizDetail> {
    authored(pool, quiz_id, viewer, "reorder questions").await?;

    let existing = find_questions(pool, quiz_id).await?;
    let wanted: HashSet<i64> = question_ids.iter().copied().collect();

    let same_set = wanted.len() == question_ids.len()
        && question_ids.len() == existing.len()
        && existing.iter().all(|q| wanted.contains(&q.id));

    if !same_set {
        return Err(ApiError::bad_request(
            "The new order must list every question in the quiz exactly once.",
        ));
    }

    let mut tx = pool.begin().await?;
    reorder_questions(&mut tx, quiz_id, question_ids).await?;
    tx.commit().await?;

    read_quiz(pool, quiz_id, Some(viewer)).await
}
