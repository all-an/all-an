-- Three starter quizzes, in three unrelated study fields.
--
-- owner_id is NULL, which marks them as seeded: they are public, nobody can edit or delete them
-- through the API, and they belong to the deployment rather than to a person. They exist so that a
-- brand-new account has something to take before it has written anything, and so the browse page
-- has more than one field populated on the first visit - which is also how the breadth of the idea
-- gets communicated at all.
--
-- Rows are addressed by (quiz title, question position) rather than by id or by prompt text.
-- Identity columns hand out whatever number is next, so ids cannot be predicted here; and prompt
-- text is not unique - a user is perfectly entitled to write their own question worded exactly
-- like one of these, at which point a lookup by prompt would match two rows and this migration
-- would fail on a database that had been in use. (quiz_id, position) is unique by constraint.

INSERT INTO quizzes (owner_id, title, description, study_field_id, subject, visibility,
                     default_time_limit_seconds, shuffle_questions)
SELECT NULL, v.title, v.description, f.id, v.subject, 'PUBLIC', v.time_limit, v.shuffle
FROM (VALUES
    ('English verb forms',
     'Present tense, past tense, and the irregular ones that refuse to follow the rule.',
     'languages', 'English grammar', 30, FALSE),
    ('Capital cities',
     'One country, one capital. Several of these are not the largest city.',
     'history-geography', 'World capitals', 20, TRUE),
    ('Mental arithmetic',
     'Times tables and a little beyond, against a short clock.',
     'mathematics', 'Mental arithmetic', 15, TRUE)
) AS v(title, description, field_slug, subject, time_limit, shuffle)
JOIN study_fields f ON f.slug = v.field_slug;

INSERT INTO questions (quiz_id, position, kind, prompt, explanation, time_limit_seconds)
SELECT z.id, v.position, v.kind, v.prompt, v.explanation, v.time_limit
FROM (VALUES
    ('English verb forms', 1, 'MULTIPLE_CHOICE', 'She ___ to work every day.',
     'The third person singular in the present simple takes -es on "go".', 30),
    ('English verb forms', 2, 'TYPED', 'What is the past tense of "buy"?',
     '"Buy" is irregular: bought, not buyed.', 25),
    ('English verb forms', 3, 'MULTIPLE_CHOICE', 'They ___ here since 2019.',
     'A period that continues up to now takes the present perfect.', 30),
    ('English verb forms', 4, 'TYPED', 'What is the past participle of "write"?',
     'Write, wrote, written.', 25),

    ('Capital cities', 1, 'TYPED', 'What is the capital of Australia?',
     'Canberra, chosen as a compromise between Sydney and Melbourne.', 20),
    ('Capital cities', 2, 'MULTIPLE_CHOICE', 'What is the capital of Brazil?',
     'Brasilia was built inland in the 1950s and replaced Rio de Janeiro.', 20),
    ('Capital cities', 3, 'TYPED', 'What is the capital of Canada?',
     'Ottawa - not Toronto, which is the larger city.', 20),
    ('Capital cities', 4, 'MULTIPLE_CHOICE', 'What is the capital of Turkey?',
     'Ankara has been the capital since 1923; Istanbul is the larger city.', 20),

    ('Mental arithmetic', 1, 'TYPED', '7 x 8', NULL, 15),
    ('Mental arithmetic', 2, 'TYPED', '144 / 12', NULL, 15),
    ('Mental arithmetic', 3, 'MULTIPLE_CHOICE', 'What is 15% of 240?',
     '10% is 24, half of that is 12, so 15% is 36.', 25),
    ('Mental arithmetic', 4, 'TYPED', 'What is 13 squared?', '13 x 13 = 169.', 20)
) AS v(quiz_title, position, kind, prompt, explanation, time_limit)
JOIN quizzes z ON z.title = v.quiz_title AND z.owner_id IS NULL;

-- For MULTIPLE_CHOICE these are the choices shown, with is_correct marking the answer.
-- For TYPED they are the accepted spellings, never shown, and every row is correct - so a typed
-- question with two rows accepts either wording.
--
-- Marking is already forgiving about case, surrounding space and a trailing full stop (see
-- grading.ts), so those need no extra rows here.
INSERT INTO question_options (question_id, position, body, is_correct)
SELECT q.id, v.position, v.body, v.is_correct
FROM (VALUES
    ('English verb forms', 1, 1, 'go', FALSE),
    ('English verb forms', 1, 2, 'goes', TRUE),
    ('English verb forms', 1, 3, 'going', FALSE),
    ('English verb forms', 1, 4, 'gone', FALSE),

    ('English verb forms', 2, 1, 'bought', TRUE),

    ('English verb forms', 3, 1, 'live', FALSE),
    ('English verb forms', 3, 2, 'lived', FALSE),
    ('English verb forms', 3, 3, 'have lived', TRUE),
    ('English verb forms', 3, 4, 'are living', FALSE),

    ('English verb forms', 4, 1, 'written', TRUE),

    ('Capital cities', 1, 1, 'Canberra', TRUE),

    ('Capital cities', 2, 1, 'Rio de Janeiro', FALSE),
    ('Capital cities', 2, 2, 'Sao Paulo', FALSE),
    ('Capital cities', 2, 3, 'Brasilia', TRUE),
    ('Capital cities', 2, 4, 'Salvador', FALSE),

    ('Capital cities', 3, 1, 'Ottawa', TRUE),

    ('Capital cities', 4, 1, 'Istanbul', FALSE),
    ('Capital cities', 4, 2, 'Ankara', TRUE),
    ('Capital cities', 4, 3, 'Izmir', FALSE),
    ('Capital cities', 4, 4, 'Bursa', FALSE),

    ('Mental arithmetic', 1, 1, '56', TRUE),
    ('Mental arithmetic', 2, 1, '12', TRUE),

    ('Mental arithmetic', 3, 1, '24', FALSE),
    ('Mental arithmetic', 3, 2, '36', TRUE),
    ('Mental arithmetic', 3, 3, '48', FALSE),
    ('Mental arithmetic', 3, 4, '30', FALSE),

    ('Mental arithmetic', 4, 1, '169', TRUE)
) AS v(quiz_title, question_position, position, body, is_correct)
JOIN quizzes z ON z.title = v.quiz_title AND z.owner_id IS NULL
JOIN questions q ON q.quiz_id = z.id AND q.position = v.question_position;
