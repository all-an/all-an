# Quizzes — the domain

## The shape of it

```
study field  →  subject  →  quiz  →  question  →  option
 (curated)     (free text)                        (choice or accepted answer)
```

**The quiz is the unit.** Title, classification and visibility live on it; a question belongs to
exactly one quiz. You browse, publish, take and score quizzes — never a loose question.

**Classification has two levels for a reason.** `study_fields` is a curated table, added to by
migration, so the browse page always has a coherent top level. `subject` underneath it is free
text, because the whole point is that a quiz can be about anything. A single free-text field would
leave the pool an unnavigable soup of "Language", "languages" and "English stuff"; a fixed two-level
taxonomy would fight the breadth the feature exists for.

## Who can see what

| | Owner | Anyone else |
|---|---|---|
| Private quiz | read, edit, take | **404** |
| Public quiz | read, edit, take | read, take |
| The questions and their answers | yes | no |

Two rules do most of the work:

**A quiz you may not see is a 404, never a 403.** A 403 would confirm that a quiz with that id
exists, which is exactly what its owner did not publish.

**`GET /api/quizzes/:id` returns the questions only to the owner.** Everyone else gets the title,
the subject and a question count. Shipping the questions to a prospective taker would hand them the
answer key before they started, and there would be no point taking it.

Seeded quizzes have `owner_id IS NULL`. They are public, and nobody — administrators included — can
edit or delete them through the API: they are part of the deployment, not user data.

An administrator has two jobs. One is removing a quiz somebody published to the shared pool: they
cannot edit it, and a private quiz stays invisible to them. The other is the site settings at
`/admin` — currently the one switch that closes registration. Neither lets them read or change
anybody's own quizzes.

## Questions

Two kinds, sharing one options table:

- **`MULTIPLE_CHOICE`** — the rows are the choices shown, and `is_correct` marks the answer.
- **`TYPED`** — the rows are the accepted spellings. Never shown; every row is correct. Several
  rows means several ways of writing the same answer.

The `isCorrect` flags a client sends for a `TYPED` question are ignored rather than trusted — for
that kind, being in the list *is* what correct means.

## Timing

Each question carries its own `time_limit_seconds`. The quiz's `default_time_limit_seconds` is what
a newly added question inherits, so authoring twenty questions does not mean typing the same number
twenty times.

**The clock is the server's.** `served_at` is stamped when the question is handed out, and elapsed
time is measured from it:

- `GET /attempts/:id/current` returns `remainingMs` computed from `served_at`. Reloading resumes
  the countdown rather than granting a fresh allowance.
- `POST /attempts/:id/answer` computes elapsed server-side. Past the limit plus two seconds of
  grace, the answer is recorded `timed_out` and incorrect — **even when the answer is right**.
- The countdown in the browser is presentation only. Getting it slightly wrong changes what you
  see, never what you score.

The two seconds of grace cover the network round trip, which is inside the measurement but outside
the taker's control. It is not enough time to look anything up.

## Marking a typed answer

Someone who types `Bought.` when the answer is `bought` knows the answer. Marking that wrong
teaches them the quiz is unreliable, and they stop trusting the score — which is the entire value
of taking it. So `normaliseTypedAnswer` ignores what carries no meaning:

- leading and trailing space, and runs of space inside
- case
- curly quotes and apostrophes, which phones insert unasked
- a trailing `.`, `!` or `?`
- surrounding quotation marks

It deliberately does **not** ignore spelling, accents or word order. Those change the answer, and a
language quiz that accepted them would be teaching the wrong thing. Where two spellings are both
genuinely right, that is what the extra option rows are for.

## Attempts

Starting an attempt **copies** the questions into `attempt_questions`, with the prompt snapshotted.
Nothing joins live to the quiz afterwards. That is what makes three things true:

- Editing a quiz in one tab cannot change what is being asked in another.
- Deleting a question next week does not rewrite what somebody answered today.
- Deleting the whole quiz leaves the results page readable — the attempt keeps the quiz's title too.

`shuffle_questions` shuffles the order at that moment. Multiple-choice options are shuffled per
request, so the correct answer is not always where the author typed it.
