from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models.package import Package


def _base_package_dict() -> dict:
    return {
        "id": "weights-demo",
        "title": "Weights Demo",
        "description": "Validation test package.",
        "version": "1.0.0",
        "tags": [],
        "passing_score": 0.8,
        "pages": [
            {"id": "page-1", "title": "Page 1", "content": "Content"},
            {"id": "page-2", "title": "Page 2", "content": "Content"},
        ],
        "questions": [
            {
                "id": "q1",
                "text": "Q1",
                "answers": [{"id": "a1", "text": "A1"}, {"id": "a2", "text": "A2"}],
                "correct_answer": "a1",
                "weight": 50,
                "feedback": "F1",
                "revision_page_ids": ["page-1"],
            },
            {
                "id": "q2",
                "text": "Q2",
                "answers": [{"id": "a1", "text": "A1"}, {"id": "a2", "text": "A2"}],
                "correct_answer": "a1",
                "weight": 50,
                "feedback": "F2",
                "revision_page_ids": ["page-2"],
            },
        ],
    }


# ---------------------------------------------------------------------------
# T48 - weight sum validator
# ---------------------------------------------------------------------------


def test_package_weights_sum_to_100_is_valid() -> None:
    Package.model_validate(_base_package_dict())


def test_package_weights_not_100_raises_validation_error() -> None:
    data = _base_package_dict()
    data["questions"][1]["weight"] = 40
    with pytest.raises(ValidationError):
        Package.model_validate(data)


def test_package_three_question_split_33_33_34_is_valid() -> None:
    data = _base_package_dict()
    data["questions"] = [
        {
            "id": "q1",
            "text": "Q1",
            "answers": [{"id": "a1", "text": "A1"}, {"id": "a2", "text": "A2"}],
            "correct_answer": "a1",
            "weight": 33,
            "feedback": "F1",
            "revision_page_ids": ["page-1"],
        },
        {
            "id": "q2",
            "text": "Q2",
            "answers": [{"id": "a1", "text": "A1"}, {"id": "a2", "text": "A2"}],
            "correct_answer": "a1",
            "weight": 33,
            "feedback": "F2",
            "revision_page_ids": ["page-1"],
        },
        {
            "id": "q3",
            "text": "Q3",
            "answers": [{"id": "a1", "text": "A1"}, {"id": "a2", "text": "A2"}],
            "correct_answer": "a1",
            "weight": 34,
            "feedback": "F3",
            "revision_page_ids": ["page-2"],
        },
    ]

    Package.model_validate(data)


# ---------------------------------------------------------------------------
# T46 - POST /packages/validate
# ---------------------------------------------------------------------------


def test_validate_package_valid_yaml() -> None:
    yaml_content = """
id: validate-demo
title: Validate Demo
description: Demo package
version: 1.0.0
tags: []
passing_score: 0.8
pages:
  - id: page-1
    title: Page 1
    content: Content
questions:
  - id: q1
    text: Question 1
    answers:
      - id: a1
        text: Answer 1
      - id: a2
        text: Answer 2
    correct_answer: a1
    weight: 50
    feedback: Feedback
    revision_page_ids:
      - page-1
  - id: q2
    text: Question 2
    answers:
      - id: a1
        text: Answer 1
      - id: a2
        text: Answer 2
    correct_answer: a1
    weight: 50
    feedback: Feedback
    revision_page_ids:
      - page-1
"""

    with TestClient(app) as client:
      response = client.post(
        "/packages/validate", json={"yaml_content": yaml_content}
      )

    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert body["package_id"] == "validate-demo"
    assert body["errors"] == []


def test_validate_package_invalid_yaml_syntax() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/packages/validate", json={"yaml_content": "id: [unterminated"}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert body["package_id"] is None
    assert any("YAML parse error:" in err for err in body["errors"])


def test_validate_package_invalid_package_missing_field() -> None:
    yaml_content = """
id: missing-title
description: Missing title should fail
version: 1.0.0
tags: []
passing_score: 0.8
pages:
  - id: page-1
    title: Page 1
    content: Content
questions:
  - id: q1
    text: Question 1
    answers:
      - id: a1
        text: Answer 1
      - id: a2
        text: Answer 2
    correct_answer: a1
    weight: 100
    feedback: Feedback
    revision_page_ids:
      - page-1
"""

    with TestClient(app) as client:
      response = client.post(
        "/packages/validate", json={"yaml_content": yaml_content}
      )

    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert body["package_id"] is None
    assert any("title" in err for err in body["errors"])


def test_validate_package_invalid_weight_sum() -> None:
    yaml_content = """
id: bad-weights
title: Bad Weights
description: Invalid weight total
version: 1.0.0
tags: []
passing_score: 0.8
pages:
  - id: page-1
    title: Page 1
    content: Content
questions:
  - id: q1
    text: Question 1
    answers:
      - id: a1
        text: Answer 1
      - id: a2
        text: Answer 2
    correct_answer: a1
    weight: 60
    feedback: Feedback
    revision_page_ids:
      - page-1
  - id: q2
    text: Question 2
    answers:
      - id: a1
        text: Answer 1
      - id: a2
        text: Answer 2
    correct_answer: a1
    weight: 30
    feedback: Feedback
    revision_page_ids:
      - page-1
"""

    with TestClient(app) as client:
      response = client.post(
        "/packages/validate", json={"yaml_content": yaml_content}
      )

    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert body["package_id"] is None
    assert any("question weights must sum to 100" in err for err in body["errors"])
