-- Widen an answer from 300 to 1000 characters.
--
-- 300 was fine for a word or a short phrase, but "answer" also covers a full sentence a learner
-- has to reproduce, a line of code, or a definition, and those run past 300 often enough that the
-- editor's save felt broken. The API's zod schema is raised to match (quizzes/routes.ts).
--
-- Only the width changes: VARCHAR(1000) is still a length cap, and the not-blank CHECK is untouched.
-- Postgres widens a VARCHAR in place without rewriting the table.
ALTER TABLE question_options ALTER COLUMN body TYPE VARCHAR(1000);
