//! Taking a quiz: starting an attempt, serving one question at a time against a server-side clock,
//! marking answers, and reporting results.
//!
//! The server owns the clock. The browser shows a countdown, but the time that counts is measured
//! from when the server first served the question - so a client that pauses its timer, or edits
//! it in dev tools, gains nothing.

use chrono::{DateTime, SecondsFormat, Utc};
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgConnection, PgPool};

use crate::{
    auth::SessionUser,
    error::{ApiError, ApiResult},
    grading::{grade_multiple_choice, grade_typed, is_timed_out},
    quizzes::{self, OptionRow},
    shares,
    validate::{Fields, len},
};

#[derive(Debug, FromRow)]
struct AttemptRow {
    id: i64,
    quiz_id: Option<i64>,
    quiz_title_snapshot: String,
    started_at: DateTime<Utc>,
    finished_at: Option<DateTime<Utc>>,
    total: i64,
    answered: i64,
    correct: i64,
}

#[derive(Debug, FromRow)]
struct AttemptQuestionRow {
    id: i64,
    question_id: Option<i64>,
    prompt_snapshot: String,
    position: i16,
    served_at: Option<DateTime<Utc>>,
    given_text: Option<String>,
    given_option_id: Option<i64>,
    is_correct: Option<bool>,
    timed_out: bool,
    elapsed_ms: Option<i32>,
}

/// Totals are computed by the query rather than stored: a stored score could drift from the
/// answers it summarises, and there is no place to be wrong if it is never stored.
const ATTEMPT_SELECT: &str = "
  SELECT a.id, a.quiz_id, a.quiz_title_snapshot, a.started_at, a.finished_at,
         (SELECT COUNT(*) FROM attempt_questions WHERE attempt_id = a.id) AS total,
         (SELECT COUNT(*) FROM attempt_questions
           WHERE attempt_id = a.id AND answered_at IS NOT NULL) AS answered,
         (SELECT COUNT(*) FROM attempt_questions
           WHERE attempt_id = a.id AND is_correct) AS correct
  FROM attempts a";

async fn find_attempt(pool: &PgPool, id: i64, user_id: i64) -> sqlx::Result<Option<AttemptRow>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!("{ATTEMPT_SELECT} WHERE a.id = $1 AND a.user_id = $2")))
        .bind(id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
}

async fn find_next_unanswered(pool: &PgPool, attempt_id: i64) -> sqlx::Result<Option<AttemptQuestionRow>> {
    sqlx::query_as(
        "SELECT id, question_id, prompt_snapshot, position, served_at, given_text,
                given_option_id, is_correct, timed_out, elapsed_ms
         FROM attempt_questions
         WHERE attempt_id = $1 AND answered_at IS NULL
         ORDER BY position LIMIT 1",
    )
    .bind(attempt_id)
    .fetch_optional(pool)
    .await
}

/// Stamps the moment a question was first shown. COALESCE keeps the first stamp: reloading the
/// page mid-question must not hand out a fresh clock.
async fn stamp_served(pool: &PgPool, id: i64) -> sqlx::Result<DateTime<Utc>> {
    let (served_at,): (DateTime<Utc>,) = sqlx::query_as(
        "UPDATE attempt_questions SET served_at = COALESCE(served_at, NOW())
         WHERE id = $1 RETURNING served_at",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(served_at)
}

struct Answer {
    given_text: Option<String>,
    given_option_id: Option<i64>,
    is_correct: bool,
    timed_out: bool,
    elapsed_ms: i32,
}

async fn record_answer(pool: &PgPool, id: i64, a: &Answer) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE attempt_questions
         SET answered_at = NOW(), given_text = $2, given_option_id = $3,
             is_correct = $4, timed_out = $5, elapsed_ms = $6
         WHERE id = $1",
    )
    .bind(id)
    .bind(&a.given_text)
    .bind(a.given_option_id)
    .bind(a.is_correct)
    .bind(a.timed_out)
    .bind(a.elapsed_ms)
    .execute(pool)
    .await?;

    Ok(())
}

async fn finish_attempt(pool: &PgPool, id: i64) -> sqlx::Result<()> {
    sqlx::query("UPDATE attempts SET finished_at = NOW() WHERE id = $1 AND finished_at IS NULL")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(())
}

async fn insert_attempt(conn: &mut PgConnection, user_id: i64, quiz_id: i64, title: &str) -> sqlx::Result<i64> {
    let (id,): (i64,) = sqlx::query_as(
        "INSERT INTO attempts (user_id, quiz_id, quiz_title_snapshot) VALUES ($1, $2, $3)
         RETURNING id",
    )
    .bind(user_id)
    .bind(quiz_id)
    .bind(title)
    .fetch_one(conn)
    .await?;

    Ok(id)
}

// --- the JSON the API speaks --------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttemptSummary {
    pub id: i64,
    pub quiz_id: Option<i64>,
    pub quiz_title: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub total: i64,
    pub answered: i64,
    pub correct: i64,
}

fn iso(at: DateTime<Utc>) -> String {
    at.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn to_summary(row: &AttemptRow) -> AttemptSummary {
    AttemptSummary {
        id: row.id,
        quiz_id: row.quiz_id,
        quiz_title: row.quiz_title_snapshot.clone(),
        started_at: iso(row.started_at),
        finished_at: row.finished_at.map(iso),
        total: row.total,
        answered: row.answered,
        correct: row.correct,
    }
}

#[derive(Debug, Serialize)]
pub struct ChoiceOption {
    pub id: i64,
    pub body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentQuestion {
    pub attempt_question_id: i64,
    pub question_id: i64,
    pub position: i16,
    pub total: i64,
    pub prompt: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<ChoiceOption>>,
    pub time_limit_seconds: i32,
    pub remaining_ms: i64,
}

/// Either the next question or `{ "finished": true }`.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum Current {
    Question(CurrentQuestion),
    Finished { finished: bool },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerResult {
    pub correct: bool,
    pub timed_out: bool,
    pub correct_answer: String,
    pub explanation: Option<String>,
    pub finished: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultQuestion {
    pub position: i16,
    pub prompt: String,
    pub your_answer: Option<String>,
    pub correct_answer: Option<String>,
    pub is_correct: Option<bool>,
    pub timed_out: bool,
    pub elapsed_ms: Option<i32>,
}

impl ResultQuestion {
    /// "3.2s", or a dash when the question was never answered.
    pub fn elapsed_label(&self) -> String {
        self.elapsed_ms.map_or_else(|| "—".to_string(), |ms| format!("{:.1}s", f64::from(ms) / 1000.0))
    }
}

#[derive(Debug, Serialize)]
pub struct AttemptResult {
    #[serde(flatten)]
    pub summary: AttemptSummary,
    pub questions: Vec<ResultQuestion>,
}

#[derive(Debug, Deserialize)]
pub struct AnswerInput {
    #[serde(rename = "optionId")]
    pub option_id: Option<i64>,
    pub text: Option<String>,
}

pub fn validate_answer(input: &AnswerInput) -> ApiResult<()> {
    let mut fields = Fields::default();
    fields.check("text", len(input.text.as_deref().unwrap_or_default()) <= 500, "that answer is too long");
    fields.finish()
}

// --- the rules ----------------------------------------------------------------------------------

/// Snapshots the questions into the attempt, so editing or deleting the quiz later cannot change
/// what an old result says it asked.
pub async fn start(pool: &PgPool, viewer: &SessionUser, quiz_id: i64) -> ApiResult<(i64, usize)> {
    let quiz = quizzes::find_quiz_by_id(pool, quiz_id)
        .await?
        .ok_or_else(|| ApiError::not_found("No such quiz."))?;

    let may_take = quiz.visibility == "PUBLIC"
        || quiz.owner_id == Some(viewer.id)
        || shares::is_quiz_shared_with(pool, quiz_id, viewer.id).await?;

    if !may_take {
        return Err(ApiError::not_found("No such quiz."));
    }

    let questions = quizzes::find_questions(pool, quiz_id).await?;

    if questions.is_empty() {
        return Err(ApiError::bad_request("That quiz has no questions yet."));
    }

    // Questions the taker has marked as learned are left out - that is what archiving one means.
    let ids: Vec<i64> = questions.iter().map(|q| q.id).collect();
    let archived = quizzes::find_archived_question_ids(pool, viewer.id, &ids).await?;
    let mut remaining: Vec<_> = questions.into_iter().filter(|q| !archived.contains(&q.id)).collect();

    if remaining.is_empty() {
        return Err(ApiError::bad_request(
            "You have archived every question in this quiz. Unarchive one to take it again.",
        ));
    }

    if quiz.shuffle_questions {
        remaining.shuffle(&mut rand::rng());
    }

    let mut tx = pool.begin().await?;
    let attempt_id = insert_attempt(&mut tx, viewer.id, quiz_id, &quiz.title).await?;

    for (index, question) in remaining.iter().enumerate() {
        sqlx::query(
            "INSERT INTO attempt_questions (attempt_id, question_id, prompt_snapshot, position)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(attempt_id)
        .bind(question.id)
        .bind(&question.prompt)
        .bind((index + 1) as i16)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok((attempt_id, remaining.len()))
}

async fn owned_attempt(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<AttemptRow> {
    find_attempt(pool, id, viewer.id)
        .await?
        .ok_or_else(|| ApiError::not_found("No such attempt."))
}

fn skipped() -> Answer {
    Answer { given_text: None, given_option_id: None, is_correct: false, timed_out: false, elapsed_ms: 0 }
}

/// The question to show now, starting its clock if this is the first time it has been shown.
/// A question that has since been deleted is recorded as skipped rather than blocking the attempt.
pub async fn current(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<Current> {
    let attempt = owned_attempt(pool, id, viewer).await?;

    loop {
        let Some(next) = find_next_unanswered(pool, id).await? else {
            finish_attempt(pool, id).await?;
            return Ok(Current::Finished { finished: true });
        };

        let question = match next.question_id {
            Some(question_id) => quizzes::find_question_by_id(pool, question_id).await?,
            None => None,
        };

        let Some(question) = question else {
            record_answer(pool, next.id, &skipped()).await?;
            continue;
        };

        let served_at = stamp_served(pool, next.id).await?;
        let elapsed_ms = (Utc::now() - served_at).num_milliseconds();
        let remaining_ms = (i64::from(question.time_limit_seconds) * 1000 - elapsed_ms).max(0);

        let options = if question.kind == "MULTIPLE_CHOICE" {
            let mut options = quizzes::find_options(pool, &[question.id]).await?;
            options.shuffle(&mut rand::rng());
            // Only id and body: which one is correct stays on the server until it has been answered.
            Some(options.into_iter().map(|o| ChoiceOption { id: o.id, body: o.body }).collect())
        } else {
            None
        };

        return Ok(Current::Question(CurrentQuestion {
            attempt_question_id: next.id,
            question_id: question.id,
            position: next.position,
            total: attempt.total,
            prompt: next.prompt_snapshot,
            kind: question.kind,
            options,
            time_limit_seconds: question.time_limit_seconds,
            remaining_ms,
        }));
    }
}

fn join_correct(options: &[OptionRow]) -> String {
    options.iter().filter(|o| o.is_correct).map(|o| o.body.as_str()).collect::<Vec<_>>().join(" / ")
}

pub async fn answer(
    pool: &PgPool,
    id: i64,
    viewer: &SessionUser,
    given: &AnswerInput,
) -> ApiResult<AnswerResult> {
    owned_attempt(pool, id, viewer).await?;

    let next = find_next_unanswered(pool, id)
        .await?
        .ok_or_else(|| ApiError::bad_request("That attempt is already finished."))?;

    let gone = || ApiError::not_found("That question no longer exists.");
    let question = quizzes::find_question_by_id(pool, next.question_id.ok_or_else(gone)?)
        .await?
        .ok_or_else(gone)?;

    let options = quizzes::find_options(pool, &[question.id]).await?;

    // Answering before the question was ever served starts its clock now, rather than counting
    // the time as zero.
    let served_at = match next.served_at {
        Some(at) => at,
        None => stamp_served(pool, next.id).await?,
    };
    let elapsed_ms = (Utc::now() - served_at).num_milliseconds();
    let timed_out = is_timed_out(elapsed_ms, question.time_limit_seconds);

    let is_multiple_choice = question.kind == "MULTIPLE_CHOICE";
    let given_text = given.text.clone();

    // A late answer is wrong whatever it says.
    let correct = !timed_out
        && if is_multiple_choice {
            let marks: Vec<(i64, bool)> = options.iter().map(|o| (o.id, o.is_correct)).collect();
            grade_multiple_choice(given.option_id, &marks)
        } else {
            let accepted: Vec<&str> = options.iter().map(|o| o.body.as_str()).collect();
            grade_typed(given_text.as_deref().unwrap_or_default(), &accepted)
        };

    record_answer(
        pool,
        next.id,
        &Answer {
            given_text,
            given_option_id: if is_multiple_choice { given.option_id } else { None },
            is_correct: correct,
            timed_out,
            elapsed_ms: elapsed_ms.clamp(0, i64::from(i32::MAX)) as i32,
        },
    )
    .await?;

    let (remaining,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM attempt_questions WHERE attempt_id = $1 AND answered_at IS NULL",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    let finished = remaining == 0;

    if finished {
        finish_attempt(pool, id).await?;
    }

    Ok(AnswerResult {
        correct,
        timed_out,
        correct_answer: join_correct(&options),
        explanation: question.explanation,
        finished,
    })
}

pub async fn finish(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<()> {
    owned_attempt(pool, id, viewer).await?;
    finish_attempt(pool, id).await?;
    Ok(())
}

pub async fn result(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<AttemptResult> {
    let attempt = owned_attempt(pool, id, viewer).await?;

    let rows: Vec<AttemptQuestionRow> = sqlx::query_as(
        "SELECT id, question_id, prompt_snapshot, position, served_at, given_text,
                given_option_id, is_correct, timed_out, elapsed_ms
         FROM attempt_questions WHERE attempt_id = $1 ORDER BY position",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let question_ids: Vec<i64> = rows.iter().filter_map(|r| r.question_id).collect();
    let options = quizzes::find_options(pool, &question_ids).await?;

    let questions = rows
        .iter()
        .map(|row| {
            let mine: Vec<&OptionRow> =
                options.iter().filter(|o| Some(o.question_id) == row.question_id).collect();
            let chosen = mine.iter().find(|o| Some(o.id) == row.given_option_id);

            ResultQuestion {
                position: row.position,
                prompt: row.prompt_snapshot.clone(),
                your_answer: chosen.map(|o| o.body.clone()).or_else(|| row.given_text.clone()),
                // None, not "", when the question has since been deleted: "no answer on file" and
                // "the answer is blank" are different things to show.
                correct_answer: (!mine.is_empty()).then(|| {
                    mine.iter().filter(|o| o.is_correct).map(|o| o.body.as_str()).collect::<Vec<_>>().join(" / ")
                }),
                is_correct: row.is_correct,
                timed_out: row.timed_out,
                elapsed_ms: row.elapsed_ms,
            }
        })
        .collect();

    Ok(AttemptResult { summary: to_summary(&attempt), questions })
}

pub async fn history(pool: &PgPool, viewer: &SessionUser) -> ApiResult<Vec<AttemptSummary>> {
    let rows: Vec<AttemptRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "{ATTEMPT_SELECT} WHERE a.user_id = $1 ORDER BY a.started_at DESC LIMIT 50"
    )))
    .bind(viewer.id)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(to_summary).collect())
}

pub async fn remove(pool: &PgPool, id: i64, viewer: &SessionUser) -> ApiResult<()> {
    let result = sqlx::query("DELETE FROM attempts WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(viewer.id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("No such attempt."));
    }

    Ok(())
}
