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
        "weight": 10,
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
    assert len(package.questions) == 4
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
