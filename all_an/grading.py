"""Marking. Pure functions, so the rules that decide whether an answer counts are testable without
a database."""

import re
import unicodedata

_CURLY_SINGLE = "‘’ʼ"
_CURLY_DOUBLE = "“”"


def normalise_typed_answer(value: str) -> str:
    """Collapses everything a person would not consider part of the answer: letter case, surrounding
    space, wrapping quotes, trailing full stops, curly vs straight quotes, runs of whitespace.

    Spelling, accents and word order all still matter - this is a language quiz as often as not.
    """
    text = unicodedata.normalize("NFC", value)
    text = re.sub(f"[{_CURLY_SINGLE}]", "'", text)
    text = re.sub(f"[{_CURLY_DOUBLE}]", '"', text)
    text = text.strip()
    text = re.sub(r"""^["']+|["']+$""", "", text)
    text = re.sub(r"[.!?]+$", "", text)

    return " ".join(text.split()).lower()


def grade_typed(given: str, accepted: list[str]) -> bool:
    normalised = normalise_typed_answer(given)

    # Running out of time and submitting nothing must never score as correct, even if a blank
    # accepted answer somehow slipped past validation.
    if normalised == "":
        return False

    return any(normalise_typed_answer(answer) == normalised for answer in accepted)


def grade_multiple_choice(given_option_id: int | None, options: list[dict]) -> bool:
    if given_option_id is None:
        return False

    chosen = next((o for o in options if o["id"] == given_option_id), None)
    return bool(chosen and chosen["is_correct"])


# The browser's clock runs from when it received the question, the server's from when it sent it;
# the gap is network latency. Without a grace period an answer given with a second to spare can
# arrive "late" on a slow connection and be marked out of time.
TIMER_GRACE_MS = 2000


def is_timed_out(elapsed_ms: float, time_limit_seconds: int) -> bool:
    return elapsed_ms > time_limit_seconds * 1000 + TIMER_GRACE_MS
