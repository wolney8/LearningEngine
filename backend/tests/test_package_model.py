from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from app.models import Answer, Package, Page, Question

SAMPLE_YAML = Path(__file__).parent.parent.parent / "packages" / "sample-demo.yaml"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _minimal_answer(id: str = "a", text: str = "Answer") -> dict:
    return {"id": id, "text": text}


def _minimal_question(**overrides) -> dict:
    base = {
        "id": "q1",
        "text": "Question text?",
        "answers": [_minimal_answer("a"), _minimal_answer("b")],
        "correct_answer": "a",
        "weight": 100,
        "feedback": "Feedback text.",
    }
    base.update(overrides)
    return base


def _minimal_page(id: str = "p1") -> dict:
    return {"id": id, "title": "Page Title", "content": "Page content."}


def _minimal_package(**overrides) -> dict:
    base = {
        "id": "sample-demo",
        "title": "Demo",
        "description": "A demo package.",
        "version": "1.0.0",
        "pages": [_minimal_page()],
        "questions": [_minimal_question()],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_valid_package_loads_from_yaml():
    with open(SAMPLE_YAML) as f:
        data = yaml.safe_load(f)
    package = Package.model_validate(data)
    assert package.id == "sample-demo"
    assert len(package.pages) == 3
    assert len(package.questions) == 16
    assert isinstance(package.pages[0], Page)
    assert isinstance(package.questions[0], Question)
    assert isinstance(package.questions[0].answers[0], Answer)


def test_passing_score_defaults_to_080():
    pkg = Package.model_validate(_minimal_package())
    assert pkg.passing_score == pytest.approx(0.80)


def test_tags_default_to_empty_list():
    pkg = Package.model_validate(_minimal_package())
    assert pkg.tags == []


def test_revision_page_ids_default_empty():
    pkg = Package.model_validate(_minimal_package())
    assert pkg.questions[0].revision_page_ids == []


def test_difficulty_field_defaults_to_none():
    """Question without difficulty key parses; .difficulty is None."""
    pkg = Package.model_validate(_minimal_package())
    assert pkg.questions[0].difficulty is None


def test_valid_tagged_package_all_groups_sum_to_100():
    """Package with 4 questions (one per difficulty, weight=100 each).

    Validates successfully.
    """
    data = _minimal_package(
        questions=[
            _minimal_question(id="q-easy", difficulty="easy", weight=100),
            _minimal_question(id="q-normal", difficulty="normal", weight=100),
            _minimal_question(id="q-hard", difficulty="hard", weight=100),
            _minimal_question(id="q-expert", difficulty="expert", weight=100),
        ]
    )

    pkg = Package.model_validate(data)
    assert len(pkg.questions) == 4
    assert {q.difficulty for q in pkg.questions} == {"easy", "normal", "hard", "expert"}


def test_mixed_tagged_untagged_raises():
    """2 questions: one with difficulty='easy', one without → ValidationError."""
    data = _minimal_package(
        questions=[
            _minimal_question(id="q-tagged", difficulty="easy", weight=100),
            _minimal_question(id="q-untagged", weight=100),
        ]
    )

    with pytest.raises(ValidationError) as exc:
        Package.model_validate(data)

    msg = str(exc.value)
    assert "difficulty" in msg
    assert "tagged" in msg
    assert "untagged" in msg


def test_tagged_group_weights_not_summing_to_100_raises():
    """Easy group weights sum to 90 → ValidationError mentioning 'easy'."""
    data = _minimal_package(
        questions=[
            _minimal_question(id="q-easy-a", difficulty="easy", weight=50),
            _minimal_question(id="q-easy-b", difficulty="easy", weight=40),
            _minimal_question(id="q-normal", difficulty="normal", weight=100),
        ]
    )

    with pytest.raises(ValidationError) as exc:
        Package.model_validate(data)

    msg = str(exc.value)
    assert "easy" in msg
    assert "sum to 100" in msg


def test_multiple_questions_per_group_sum_correctly():
    """2 easy (w=60, w=40) + 2 normal (w=70, w=30) → passes validation."""
    data = _minimal_package(
        questions=[
            _minimal_question(id="q-easy-a", difficulty="easy", weight=60),
            _minimal_question(id="q-easy-b", difficulty="easy", weight=40),
            _minimal_question(id="q-normal-a", difficulty="normal", weight=70),
            _minimal_question(id="q-normal-b", difficulty="normal", weight=30),
        ]
    )

    pkg = Package.model_validate(data)
    assert len(pkg.questions) == 4


def test_tagged_group_with_wrong_sum_raises():
    """2 hard questions with weights 50 + 40 = 90 → ValidationError."""
    data = _minimal_package(
        questions=[
            _minimal_question(id="q-hard-a", difficulty="hard", weight=50),
            _minimal_question(id="q-hard-b", difficulty="hard", weight=40),
            _minimal_question(id="q-easy", difficulty="easy", weight=100),
        ]
    )

    with pytest.raises(ValidationError) as exc:
        Package.model_validate(data)

    msg = str(exc.value)
    assert "hard" in msg
    assert "sum to 100" in msg


def test_legacy_package_no_tags_still_passes():
    """Existing single-question package (weight=100, no difficulty) → validates."""
    pkg = Package.model_validate(_minimal_package())
    assert pkg.questions[0].difficulty is None


def test_tagged_package_invalid_difficulty_value_raises():
    """difficulty='medium' (not in Literal) → ValidationError."""
    data = _minimal_package(
        questions=[_minimal_question(id="q-medium", difficulty="medium", weight=100)]
    )

    with pytest.raises(ValidationError) as exc:
        Package.model_validate(data)

    msg = str(exc.value)
    assert "difficulty" in msg
    assert "easy" in msg
    assert "normal" in msg
    assert "hard" in msg
    assert "expert" in msg


def test_sample_yaml_loads_after_migration():
    """Reload sample-demo.yaml and assert migration expectations.

    The package should contain 16 questions and all must have difficulty set.
    """
    with open(SAMPLE_YAML) as f:
        data = yaml.safe_load(f)

    package = Package.model_validate(data)
    assert len(package.questions) == 16
    assert all(question.difficulty is not None for question in package.questions)


# ---------------------------------------------------------------------------
# Required field validation
# ---------------------------------------------------------------------------


def test_missing_title_raises():
    data = _minimal_package()
    del data["title"]
    with pytest.raises(ValidationError):
        Package.model_validate(data)


def test_missing_description_raises():
    data = _minimal_package()
    del data["description"]
    with pytest.raises(ValidationError):
        Package.model_validate(data)


# ---------------------------------------------------------------------------
# Answer count constraints
# ---------------------------------------------------------------------------


def test_too_few_answers_raises():
    data = _minimal_package(
        questions=[_minimal_question(answers=[_minimal_answer("a")])]
    )
    with pytest.raises(ValidationError):
        Package.model_validate(data)


def test_too_many_answers_raises():
    answers = [_minimal_answer(str(i)) for i in range(7)]
    data = _minimal_package(
        questions=[_minimal_question(answers=answers, correct_answer="0")]
    )
    with pytest.raises(ValidationError):
        Package.model_validate(data)


# ---------------------------------------------------------------------------
# correct_answer validation
# ---------------------------------------------------------------------------


def test_invalid_correct_answer_raises():
    data = _minimal_package(questions=[_minimal_question(correct_answer="z")])
    with pytest.raises(ValidationError):
        Package.model_validate(data)


# ---------------------------------------------------------------------------
# weight validation
# ---------------------------------------------------------------------------


def test_negative_weight_raises():
    data = _minimal_package(questions=[_minimal_question(weight=-5)])
    with pytest.raises(ValidationError):
        Package.model_validate(data)


# ---------------------------------------------------------------------------
# passing_score validation
# ---------------------------------------------------------------------------


def test_passing_score_above_one_raises():
    data = _minimal_package(passing_score=1.5)
    with pytest.raises(ValidationError):
        Package.model_validate(data)


# ---------------------------------------------------------------------------
# Package id validation
# ---------------------------------------------------------------------------


def test_invalid_package_id_raises():
    data = _minimal_package(id="My Package")
    with pytest.raises(ValidationError):
        Package.model_validate(data)


def test_package_id_with_leading_hyphen_raises():
    data = _minimal_package(id="-demo")
    with pytest.raises(ValidationError):
        Package.model_validate(data)


# ---------------------------------------------------------------------------
# Empty list validation
# ---------------------------------------------------------------------------


def test_empty_pages_list_raises():
    data = _minimal_package(pages=[])
    with pytest.raises(ValidationError):
        Package.model_validate(data)


def test_empty_questions_list_raises():
    data = _minimal_package(questions=[])
    with pytest.raises(ValidationError):
        Package.model_validate(data)


# ---------------------------------------------------------------------------
# Cross-model revision_page_ids validation
# ---------------------------------------------------------------------------


def test_invalid_revision_page_id_raises():
    data = _minimal_package(
        questions=[_minimal_question(revision_page_ids=["nonexistent-page"])]
    )
    with pytest.raises(ValidationError):
        Package.model_validate(data)


# ---------------------------------------------------------------------------
# version format validation
# ---------------------------------------------------------------------------


def test_invalid_version_format_raises():
    data = _minimal_package(version="not-a-semver")
    with pytest.raises(ValidationError):
        Package.model_validate(data)
