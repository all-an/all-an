//! Marking. Pure functions, so the rules that decide whether an answer counts are testable
//! without a database.

/// Collapses everything a person would not consider part of the answer: letter case, surrounding
/// space, wrapping quotes, a trailing full stop, curly vs straight quotes, runs of whitespace.
pub fn normalise_typed_answer(value: &str) -> String {
    use unicode_normalization::UnicodeNormalization;

    let straightened: String = value
        .nfc()
        .map(|c| match c {
            '\u{2018}' | '\u{2019}' | '\u{02BC}' => '\'',
            '\u{201C}' | '\u{201D}' => '"',
            other => other,
        })
        .collect();

    let trimmed = straightened.trim().trim_matches(|c| c == '"' || c == '\'');
    let trimmed = trimmed.trim_end_matches(['.', '!', '?']);

    trimmed.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

pub fn grade_typed(given: &str, accepted: &[&str]) -> bool {
    let normalised = normalise_typed_answer(given);

    if normalised.is_empty() {
        return false;
    }

    accepted.iter().any(|answer| normalise_typed_answer(answer) == normalised)
}

pub fn grade_multiple_choice(given_option_id: Option<i64>, options: &[(i64, bool)]) -> bool {
    let Some(given) = given_option_id else {
        return false;
    };

    options.iter().find(|(id, _)| *id == given).is_some_and(|(_, correct)| *correct)
}

/// The browser's clock runs from when it received the question, the server's from when it sent it;
/// the gap is network latency. Without a grace period an answer given with a second to spare can
/// arrive "late" on a slow connection and be marked out of time.
pub const TIMER_GRACE_MS: i64 = 2000;

pub fn is_timed_out(elapsed_ms: i64, time_limit_seconds: i32) -> bool {
    elapsed_ms > i64::from(time_limit_seconds) * 1000 + TIMER_GRACE_MS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typed_answers_ignore_case_space_quotes_and_full_stops() {
        assert!(grade_typed("  Lisbon. ", &["lisbon"]));
        assert!(grade_typed("\"Lisbon\"", &["Lisbon"]));
        assert!(grade_typed("new   york", &["New York"]));
        assert!(grade_typed("don\u{2019}t", &["don't"]));
        assert!(grade_typed("Yes!", &["yes"]));
    }

    #[test]
    fn typed_answers_must_actually_match() {
        assert!(!grade_typed("", &["lisbon"]));
        assert!(!grade_typed("   ", &[""]));
        assert!(!grade_typed("porto", &["lisbon"]));
    }

    #[test]
    fn any_accepted_spelling_counts() {
        assert!(grade_typed("colour", &["color", "colour"]));
    }

    #[test]
    fn accents_compose_before_comparing() {
        assert!(grade_typed("cafe\u{0301}", &["caf\u{00E9}"]));
    }

    #[test]
    fn multiple_choice_needs_a_correct_chosen_option() {
        let options = [(1, false), (2, true)];
        assert!(grade_multiple_choice(Some(2), &options));
        assert!(!grade_multiple_choice(Some(1), &options));
        assert!(!grade_multiple_choice(Some(9), &options));
        assert!(!grade_multiple_choice(None, &options));
    }

    #[test]
    fn grace_period_allows_a_little_latency() {
        assert!(!is_timed_out(31_999, 30));
        assert!(is_timed_out(32_001, 30));
    }
}
