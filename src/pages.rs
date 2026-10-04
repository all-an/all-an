//! The pages: server-rendered HTML. Everything a page can show without the browser doing any work
//! is in the first response, so there is no loading state and no signed-out flash; JavaScript
//! (static/js) only adds the behaviour - forms, buttons, the quiz clock.

use askama::Template;
use axum::{
    Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Redirect, Response},
    routing::get,
};
use serde_json::json;
use std::collections::HashMap;

use crate::{
    attempts::{self, AttemptResult, AttemptSummary},
    auth::{MaybeUser, PageAdmin, PageUser, SessionUser},
    error::ApiError,
    friends::{self, Friend, FriendRequest},
    messages::CONTACT_EMAIL,
    quizzes::{self, QuizSummary},
    settings,
    shares::{self, Shared},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(front))
        .route("/about", get(about))
        .route("/message", get(message))
        .route("/login", get(login))
        .route("/register", get(register))
        .route("/admin", get(admin))
        .route("/friends", get(friends_page))
        .route("/shared", get(shared_page))
        .route("/quizzes", get(my_quizzes))
        .route("/quizzes/browse", get(browse))
        .route("/quizzes/browse/{slug}", get(browse))
        .route("/quizzes/new", get(editor_new))
        .route("/quizzes/attempt/{id}", get(runner))
        .route("/quizzes/{id}/edit", get(editor_edit))
        .route("/quizzes/{id}/take", get(take))
        .route("/results", get(history))
        .route("/results/{id}", get(result))
        // Anywhere else is the front page, as it was when the router's catch-all did the same.
        .fallback(|| async { Redirect::to("/") })
}

/// What the layout needs to draw the top bar.
struct Nav {
    signed_in: bool,
    is_admin: bool,
    /// The link for the page you are on is hidden: it would only link to itself.
    active: &'static str,
}

fn nav(user: Option<&SessionUser>, active: &'static str) -> Nav {
    Nav { signed_in: user.is_some(), is_admin: user.is_some_and(SessionUser::is_admin), active }
}

fn render<T: Template>(template: &T) -> Response {
    match template.render() {
        Ok(body) => Html(body).into_response(),
        Err(error) => {
            tracing::error!(%error, "template failed to render");
            (StatusCode::INTERNAL_SERVER_ERROR, "Something went wrong.").into_response()
        }
    }
}

fn internal(error: impl Into<ApiError>) -> Response {
    error.into().into_response()
}

/// A page-sized "no such thing", with the status to match.
#[derive(Template)]
#[template(path = "notice.html")]
struct NoticePage {
    nav: Nav,
    message: String,
    back_href: &'static str,
    back_label: &'static str,
}

fn not_found(user: &SessionUser, message: &str, back_href: &'static str, back_label: &'static str) -> Response {
    let page = NoticePage { nav: nav(Some(user), ""), message: message.to_string(), back_href, back_label };
    let mut response = render(&page);
    *response.status_mut() = StatusCode::NOT_FOUND;
    response
}

/// A path id that is not a number is not a page. Same answer as any other unknown address.
fn parse_id(raw: &str) -> Option<i64> {
    (!raw.is_empty() && raw.bytes().all(|b| b.is_ascii_digit())).then(|| raw.parse().ok()).flatten()
}

// --- static-ish pages ---------------------------------------------------------------------------

#[derive(Template)]
#[template(path = "front.html")]
struct FrontPage {
    nav: Nav,
}

async fn front(MaybeUser(user): MaybeUser) -> Response {
    render(&FrontPage { nav: nav(user.as_ref(), "") })
}

struct StackGroup {
    label: &'static str,
    items: &'static [&'static str],
}

/// Grouped rather than one flat badge wall: the grouping is the signal. A reader scanning for
/// "does he know messaging?" finds the answer without reading thirty logos.
const STACK: &[StackGroup] = &[
    StackGroup { label: "Languages", items: &["Java", "Rust", "TypeScript", "JavaScript", "Python", "Bash"] },
    StackGroup { label: "Backend", items: &["Spring Boot", "Quarkus", "Axum", "REST APIs"] },
    StackGroup { label: "Frontend", items: &["Angular", "React"] },
    StackGroup { label: "Data", items: &["PostgreSQL", "MySQL", "Flyway", "Liquibase"] },
    StackGroup { label: "Messaging", items: &["RabbitMQ", "Apache Kafka"] },
    StackGroup { label: "Infrastructure", items: &["AWS", "Docker", "Linux"] },
    StackGroup { label: "Practices", items: &["TDD", "BDD", "DDD"] },
];

#[derive(Template)]
#[template(path = "about.html")]
struct AboutPage {
    nav: Nav,
    stack: &'static [StackGroup],
}

async fn about(MaybeUser(user): MaybeUser) -> Response {
    render(&AboutPage { nav: nav(user.as_ref(), "about"), stack: STACK })
}

#[derive(Template)]
#[template(path = "message.html")]
struct MessagePage {
    nav: Nav,
    contact_email: &'static str,
}

async fn message(MaybeUser(user): MaybeUser) -> Response {
    render(&MessagePage { nav: nav(user.as_ref(), "message"), contact_email: CONTACT_EMAIL })
}

#[derive(Template)]
#[template(path = "auth.html")]
struct AuthPage {
    nav: Nav,
    register: bool,
    registration_open: bool,
    contact_email: &'static str,
}

async fn auth_page(state: &AppState, user: Option<&SessionUser>, register: bool) -> Response {
    let registration_open = match settings::read(&state.pool).await {
        Ok(settings) => settings.registration_enabled,
        Err(error) => return internal(error),
    };

    render(&AuthPage {
        nav: nav(user, "login"),
        register,
        registration_open,
        contact_email: CONTACT_EMAIL,
    })
}

async fn login(State(state): State<AppState>, MaybeUser(user): MaybeUser) -> Response {
    auth_page(&state, user.as_ref(), false).await
}

async fn register(State(state): State<AppState>, MaybeUser(user): MaybeUser) -> Response {
    auth_page(&state, user.as_ref(), true).await
}

#[derive(Template)]
#[template(path = "admin.html")]
struct AdminPage {
    nav: Nav,
    registration_enabled: bool,
}

async fn admin(State(state): State<AppState>, PageAdmin(user): PageAdmin) -> Response {
    match settings::read(&state.pool).await {
        Ok(settings) => render(&AdminPage {
            nav: nav(Some(&user), "admin"),
            registration_enabled: settings.registration_enabled,
        }),
        Err(error) => internal(error),
    }
}

// --- friends ------------------------------------------------------------------------------------

#[derive(Template)]
#[template(path = "friends.html")]
struct FriendsPage {
    nav: Nav,
    friends: Vec<Friend>,
    incoming: Vec<FriendRequest>,
    outgoing: Vec<FriendRequest>,
}

async fn friends_page(State(state): State<AppState>, PageUser(user): PageUser) -> Response {
    let (friends, requests) = match tokio::try_join!(
        friends::list_friends(&state.pool, &user),
        friends::list_requests(&state.pool, &user)
    ) {
        Ok(both) => both,
        Err(error) => return internal(error),
    };

    let (incoming, outgoing) = requests.into_iter().partition(|r| r.direction == "INCOMING");

    render(&FriendsPage { nav: nav(Some(&user), "friends"), friends, incoming, outgoing })
}

#[derive(Template)]
#[template(path = "shared.html")]
struct SharedPage {
    nav: Nav,
    shared: Shared,
    own_quizzes: Vec<QuizSummary>,
}

async fn shared_page(State(state): State<AppState>, PageUser(user): PageUser) -> Response {
    let (shared, own_quizzes) = match tokio::try_join!(
        shares::list_shared(&state.pool, &user),
        quizzes::list_own(&state.pool, &user, None, None, false)
    ) {
        Ok(both) => both,
        Err(error) => return internal(error),
    };

    render(&SharedPage { nav: nav(Some(&user), "friends"), shared, own_quizzes })
}

// --- quiz lists ---------------------------------------------------------------------------------

struct Chip {
    label: String,
    href: String,
    selected: bool,
    /// Rendered muted, so the shape of the taxonomy stays readable when a field has nothing in it.
    empty: bool,
}

/// Percent-encodes everything outside the unreserved set, which is more than strictly needed and
/// never wrong.
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            other => format!("%{other:02X}"),
        })
        .collect()
}

fn with_query(base: String, params: &[(&str, Option<&str>)]) -> String {
    let pairs: Vec<String> = params
        .iter()
        .filter_map(|(key, value)| value.map(|v| format!("{key}={}", encode(v))))
        .collect();

    if pairs.is_empty() { base } else { format!("{base}?{}", pairs.join("&")) }
}

fn non_blank(value: Option<&String>) -> Option<&str> {
    value.map(|v| v.trim()).filter(|v| !v.is_empty())
}

#[derive(Template)]
#[template(path = "browse.html")]
struct BrowsePage {
    nav: Nav,
    archived: bool,
    view_chips: Vec<Chip>,
    field_chips: Vec<Chip>,
    subject_chips: Vec<Chip>,
    items: Vec<QuizSummary>,
}

async fn browse(
    State(state): State<AppState>,
    MaybeUser(user): MaybeUser,
    slug: Option<Path<String>>,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let field = slug.map(|Path(slug)| slug);
    let subject = non_blank(params.get("subject"));
    // Only somebody signed in has an archive to look at.
    let archived = user.is_some() && params.get("archived").is_some_and(|v| v == "1");

    let url = |field: Option<&str>, subject: Option<&str>, archived: bool| {
        let base = field.map_or_else(|| "/quizzes/browse".to_string(), |f| format!("/quizzes/browse/{}", encode(f)));
        with_query(base, &[("subject", subject), ("archived", archived.then_some("1"))])
    };

    let loaded = tokio::try_join!(
        quizzes::list_public(&state.pool, user.as_ref(), field.as_deref(), subject, 50, 0, archived),
        quizzes::list_study_fields(&state.pool),
        quizzes::list_subjects(&state.pool, user.as_ref(), false, field.as_deref()),
    );

    let (items, fields, subjects) = match loaded {
        Ok(loaded) => loaded,
        Err(error) => return internal(error),
    };

    let view_chips = vec![
        Chip { label: "All quizzes".into(), href: url(field.as_deref(), subject, false), selected: !archived, empty: false },
        Chip { label: "Archived".into(), href: url(field.as_deref(), subject, true), selected: archived, empty: false },
    ];

    let field_chips = fields
        .iter()
        .map(|f| {
            let selected = field.as_deref() == Some(f.slug.as_str());
            Chip {
                label: format!("{} ({})", f.name, f.public_quiz_count),
                // Picking the selected field again clears it. The subject is dropped either way: it
                // belonged to the field you are leaving.
                href: url((!selected).then_some(f.slug.as_str()), None, archived),
                selected,
                empty: f.public_quiz_count == 0,
            }
        })
        .collect();

    let subject_chips = subjects
        .iter()
        .map(|name| {
            let selected = subject == Some(name.as_str());
            Chip {
                label: name.clone(),
                href: url(field.as_deref(), (!selected).then_some(name.as_str()), archived),
                selected,
                empty: false,
            }
        })
        .collect();

    render(&BrowsePage {
        nav: nav(user.as_ref(), "browse"),
        archived,
        view_chips,
        field_chips,
        subject_chips,
        items,
    })
}

#[derive(Template)]
#[template(path = "my_quizzes.html")]
struct MyQuizzesPage {
    nav: Nav,
    archived: bool,
    view_chips: Vec<Chip>,
    field_chips: Vec<Chip>,
    subject_chips: Vec<Chip>,
    items: Vec<QuizSummary>,
}

async fn my_quizzes(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let field = non_blank(params.get("field"));
    let subject = non_blank(params.get("subject"));
    let archived = params.get("archived").is_some_and(|v| v == "1");

    let url = |field: Option<&str>, subject: Option<&str>, archived: bool| {
        with_query(
            "/quizzes".to_string(),
            &[("field", field), ("subject", subject), ("archived", archived.then_some("1"))],
        )
    };

    let loaded = tokio::try_join!(
        quizzes::list_own(&state.pool, &user, field, subject, archived),
        quizzes::list_study_fields(&state.pool),
        quizzes::list_subjects(&state.pool, Some(&user), true, None),
    );

    let (items, fields, subjects) = match loaded {
        Ok(loaded) => loaded,
        Err(error) => return internal(error),
    };

    let view_chips = vec![
        Chip { label: "Active".into(), href: url(field, subject, false), selected: !archived, empty: false },
        Chip { label: "Archived".into(), href: url(field, subject, true), selected: archived, empty: false },
    ];

    let field_chips = fields
        .iter()
        .map(|f| {
            let selected = field == Some(f.slug.as_str());
            Chip {
                label: f.name.clone(),
                href: url((!selected).then_some(f.slug.as_str()), subject, archived),
                selected,
                empty: false,
            }
        })
        .collect();

    let subject_chips = subjects
        .iter()
        .map(|name| {
            let selected = subject == Some(name.as_str());
            Chip {
                label: name.clone(),
                href: url(field, (!selected).then_some(name.as_str()), archived),
                selected,
                empty: false,
            }
        })
        .collect();

    render(&MyQuizzesPage {
        nav: nav(Some(&user), "quizzes"),
        archived,
        view_chips,
        field_chips,
        subject_chips,
        items,
    })
}

// --- the editor ---------------------------------------------------------------------------------

#[derive(Template)]
#[template(path = "editor.html")]
struct EditorPage {
    nav: Nav,
    quiz_id: Option<i64>,
    data_json: String,
}

/// JSON for an inline `<script type="application/json">`. The browser ends that element at the
/// first `</script>` it sees, whatever is quoted around it, so the characters that could spell one
/// are written as escapes - still valid JSON, and `JSON.parse` reads them back unchanged.
fn script_json(value: &serde_json::Value) -> String {
    value
        .to_string()
        .replace('<', "\\u003c")
        .replace('>', "\\u003e")
        .replace('&', "\\u0026")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

async fn editor(state: &AppState, user: SessionUser, quiz_id: Option<i64>) -> Response {
    let quiz = match quiz_id {
        Some(id) => match quizzes::read_quiz(&state.pool, id, Some(&user)).await {
            // The editor is for the author's own quizzes; for anybody else's it is not a page.
            Ok(quiz) if quiz.summary.owned => Some(quiz),
            Ok(_) | Err(ApiError { status: StatusCode::NOT_FOUND, .. }) => {
                return not_found(&user, "No such quiz.", "/quizzes", "Back to my quizzes");
            }
            Err(error) => return error.into_response(),
        },
        None => None,
    };

    let loaded = tokio::try_join!(
        quizzes::list_study_fields(&state.pool),
        quizzes::list_subjects(&state.pool, Some(&user), true, None),
        friends::list_friends(&state.pool, &user),
    );

    let (fields, subjects, friends) = match loaded {
        Ok(loaded) => loaded,
        Err(error) => return internal(error),
    };

    let data = json!({ "quiz": quiz, "fields": fields, "subjects": subjects, "friends": friends });

    render(&EditorPage {
        nav: nav(Some(&user), "quizzes"),
        quiz_id,
        data_json: script_json(&data),
    })
}

async fn editor_new(State(state): State<AppState>, PageUser(user): PageUser) -> Response {
    editor(&state, user, None).await
}

async fn editor_edit(State(state): State<AppState>, PageUser(user): PageUser, Path(raw): Path<String>) -> Response {
    match parse_id(&raw) {
        Some(id) => editor(&state, user, Some(id)).await,
        None => Redirect::to("/").into_response(),
    }
}

// --- taking a quiz ------------------------------------------------------------------------------

#[derive(Template)]
#[template(path = "start.html")]
struct StartPage {
    nav: Nav,
    quiz_id: i64,
}

async fn take(PageUser(user): PageUser, Path(raw): Path<String>) -> Response {
    match parse_id(&raw) {
        Some(quiz_id) => render(&StartPage { nav: nav(Some(&user), "quizzes"), quiz_id }),
        None => Redirect::to("/").into_response(),
    }
}

#[derive(Template)]
#[template(path = "runner.html")]
struct RunnerPage {
    nav: Nav,
    attempt_id: i64,
}

async fn runner(PageUser(user): PageUser, Path(raw): Path<String>) -> Response {
    match parse_id(&raw) {
        Some(attempt_id) => render(&RunnerPage { nav: nav(Some(&user), "quizzes"), attempt_id }),
        None => Redirect::to("/").into_response(),
    }
}

// --- results ------------------------------------------------------------------------------------

#[derive(Template)]
#[template(path = "history.html")]
struct HistoryPage {
    nav: Nav,
    items: Vec<AttemptSummary>,
}

async fn history(State(state): State<AppState>, PageUser(user): PageUser) -> Response {
    match attempts::history(&state.pool, &user).await {
        Ok(items) => render(&HistoryPage { nav: nav(Some(&user), "results"), items }),
        Err(error) => internal(error),
    }
}

#[derive(Template)]
#[template(path = "result.html")]
struct ResultPage {
    nav: Nav,
    attempt: AttemptResult,
    percent: i64,
}

async fn result(State(state): State<AppState>, PageUser(user): PageUser, Path(raw): Path<String>) -> Response {
    let Some(id) = parse_id(&raw) else {
        return Redirect::to("/").into_response();
    };

    match attempts::result(&state.pool, id, &user).await {
        Ok(attempt) => {
            let total = attempt.summary.total;
            let percent = if total == 0 { 0 } else { (attempt.summary.correct * 100 + total / 2) / total };

            render(&ResultPage { nav: nav(Some(&user), "results"), attempt, percent })
        }
        Err(ApiError { status: StatusCode::NOT_FOUND, .. }) => {
            not_found(&user, "No such attempt.", "/results", "All results")
        }
        Err(error) => error.into_response(),
    }
}
