import pytest

from all_an.grading import (
    TIMER_GRACE_MS,
    grade_multiple_choice,
    grade_typed,
    is_timed_out,
    normalise_typed_answer,
)


class TestNormalise:
    def test_ignores_case_and_surrounding_space(self):
        assert normalise_typed_answer("  Bought  ") == "bought"

    def test_ignores_a_trailing_full_stop_question_mark_or_exclamation(self):
        assert normalise_typed_answer("bought.") == "bought"
        assert normalise_typed_answer("bought?") == "bought"
        assert normalise_typed_answer("bought!!") == "bought"

    def test_collapses_runs_of_space(self):
        assert normalise_typed_answer("have   lived") == "have lived"

    def test_a_curly_apostrophe_is_a_plain_one_because_phones_insert_them_unasked(self):
        assert normalise_typed_answer("it’s") == normalise_typed_answer("it's")

    def test_strips_surrounding_quotation_marks(self):
        assert normalise_typed_answer('"Ottawa"') == "ottawa"
        assert normalise_typed_answer("“Ottawa”") == "ottawa"

    def test_keeps_differences_that_change_the_answer(self):
        assert normalise_typed_answer("bougth") != "bought"
        assert normalise_typed_answer("Brasília") != "brasilia"
        assert normalise_typed_answer("lived have") != "have lived"

    def test_composes_accents_before_comparing(self):
        assert normalise_typed_answer("café") == normalise_typed_answer("café")


class TestGradeTyped:
    def test_accepts_any_of_the_listed_spellings(self):
        assert grade_typed("Bought.", ["bought"])
        assert grade_typed("brasilia", ["Brasilia", "Brasília"])
        assert grade_typed("Brasília", ["Brasilia", "Brasília"])

    def test_rejects_a_wrong_answer(self):
        assert not grade_typed("buyed", ["bought"])

    @pytest.mark.parametrize("given", ["", "   ", ".", '""'])
    def test_rejects_an_empty_answer_even_when_an_accepted_answer_is_somehow_blank(self, given):
        assert not grade_typed(given, ["bought"])
        assert not grade_typed(given, [""])


class TestMultipleChoice:
    options = [{"id": 1, "is_correct": False}, {"id": 2, "is_correct": True}]

    def test_needs_a_correct_chosen_option(self):
        assert grade_multiple_choice(2, self.options)
        assert not grade_multiple_choice(1, self.options)

    def test_no_answer_or_an_unknown_option_is_wrong(self):
        assert not grade_multiple_choice(None, self.options)
        assert not grade_multiple_choice(99, self.options)


class TestTimeout:
    def test_the_limit_plus_a_grace_period_is_allowed(self):
        assert not is_timed_out(30_000, 30)
        assert not is_timed_out(30_000 + TIMER_GRACE_MS, 30)

    def test_after_the_grace_period_it_is_late(self):
        assert is_timed_out(30_000 + TIMER_GRACE_MS + 1, 30)
