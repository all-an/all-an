-- Per-user "I've learned this" markers, at two granularities.
--
-- Archiving is a property of the reader, not of the quiz: a learner archives a public quiz they do
-- not own, and it must vanish from their lists without touching anyone else's. So it lives in its
-- own join table keyed by the user, never as a column on quizzes or questions.

-- A quiz the user has set aside. Hidden from their Browse and My Quizzes lists until unarchived.
CREATE TABLE quiz_archives (
    user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    quiz_id     BIGINT NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
    archived_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, quiz_id)
);

-- A single question the user has learned. Skipped when they next take the quiz it belongs to, and
-- shown greyed with an Unarchive control in the editor.
CREATE TABLE question_archives (
    user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
    archived_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, question_id)
);

-- The reverse lookups: "which of this user's archives cover these quizzes / questions". The primary
-- key already indexes (user_id, ...), which serves the EXISTS checks the listings run.
