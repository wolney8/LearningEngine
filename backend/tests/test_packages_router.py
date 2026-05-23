from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.package import Package
from app.routers.packages import get_package_overrides, get_packages_cache
from app.services.overrides_loader import PackageOverride

# ---------------------------------------------------------------------------
# Shared fixture data
# ---------------------------------------------------------------------------

_SAMPLE_DATA = {
    "id": "sample-demo",
    "title": "Sample Demo Package",
    "description": "A demo package for testing.",
    "version": "1.0.0",
    "tags": ["demo"],
    "passing_score": 0.75,
    "pages": [
        {"id": "p1", "title": "Page 1", "content": "Content 1."},
        {"id": "p2", "title": "Page 2", "content": "Content 2."},
    ],
    "questions": [
        {
            "id": "q1",
            "text": "Question?",
            "answers": [{"id": "a", "text": "Yes"}, {"id": "b", "text": "No"}],
            "correct_answer": "a",
            "weight": 100.0,
            "feedback": "Correct.",
            "revision_page_ids": ["p1"],
        }
    ],
}

SAMPLE_PACKAGE = Package.model_validate(_SAMPLE_DATA)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def client_with_package():
    cache = {"sample-demo": SAMPLE_PACKAGE}
    overrides: dict[str, PackageOverride] = {}
    app.dependency_overrides[get_packages_cache] = lambda: cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
async def client_empty():
    app.dependency_overrides[get_packages_cache] = lambda: {}
    app.dependency_overrides[get_package_overrides] = lambda: {}
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /packages — list
# ---------------------------------------------------------------------------


async def test_list_packages_returns_200(client_with_package: AsyncClient) -> None:
    response = await client_with_package.get("/packages")
    assert response.status_code == 200


async def test_list_packages_returns_one_item(client_with_package: AsyncClient) -> None:
    response = await client_with_package.get("/packages")
    assert len(response.json()) == 1


async def test_list_packages_empty_cache(client_empty: AsyncClient) -> None:
    response = await client_empty.get("/packages")
    assert response.status_code == 200
    assert response.json() == []


async def test_list_packages_shape_is_summary(client_with_package: AsyncClient) -> None:
    response = await client_with_package.get("/packages")
    item = response.json()[0]
    assert "page_count" in item
    assert "question_count" in item
    assert item["availability"] == "available"
    assert item["enabled"] is True
    assert "pages" not in item
    assert "questions" not in item


async def test_list_packages_counts_correct(client_with_package: AsyncClient) -> None:
    response = await client_with_package.get("/packages")
    item = response.json()[0]
    assert item["page_count"] == 2
    assert item["question_count"] == 1


# ---------------------------------------------------------------------------
# GET /packages/{id} — detail
# ---------------------------------------------------------------------------


async def test_get_package_by_id_returns_200(client_with_package: AsyncClient) -> None:
    response = await client_with_package.get("/packages/sample-demo")
    assert response.status_code == 200
    assert response.json()["id"] == "sample-demo"


async def test_get_package_full_shape(client_with_package: AsyncClient) -> None:
    response = await client_with_package.get("/packages/sample-demo")
    body = response.json()
    assert "pages" in body
    assert "questions" in body
    assert len(body["pages"]) == 2


async def test_get_package_unknown_id_returns_404(
    client_with_package: AsyncClient,
) -> None:
    response = await client_with_package.get("/packages/nonexistent")
    assert response.status_code == 404
    assert response.json() == {"detail": "Package not found"}


async def test_get_package_empty_cache_returns_404(client_empty: AsyncClient) -> None:
    response = await client_empty.get("/packages/sample-demo")
    assert response.status_code == 404


async def test_list_packages_excludes_hidden(client_with_package: AsyncClient) -> None:
    app.dependency_overrides[get_package_overrides] = lambda: {
        "sample-demo": PackageOverride(availability="hidden")
    }
    response = await client_with_package.get("/packages")
    assert response.status_code == 200
    assert response.json() == []


async def test_list_packages_includes_unavailable_with_flag(
    client_with_package: AsyncClient,
) -> None:
    app.dependency_overrides[get_package_overrides] = lambda: {
        "sample-demo": PackageOverride(availability="unavailable")
    }
    response = await client_with_package.get("/packages")
    assert response.status_code == 200
    item = response.json()[0]
    assert item["availability"] == "unavailable"
    assert item["enabled"] is False


async def test_get_package_hidden_returns_404(client_with_package: AsyncClient) -> None:
    app.dependency_overrides[get_package_overrides] = lambda: {
        "sample-demo": PackageOverride(availability="hidden")
    }
    response = await client_with_package.get("/packages/sample-demo")
    assert response.status_code == 404
    assert response.json() == {"detail": "Package not found"}


async def test_get_package_unavailable_returns_403(
    client_with_package: AsyncClient,
) -> None:
    app.dependency_overrides[get_package_overrides] = lambda: {
        "sample-demo": PackageOverride(availability="unavailable")
    }
    response = await client_with_package.get("/packages/sample-demo")
    assert response.status_code == 403
    assert response.json() == {"detail": "Package is unavailable"}


# ---------------------------------------------------------------------------
# POST /packages/generate
# ---------------------------------------------------------------------------


async def test_generate_package_returns_503_when_api_key_missing(
    client_empty: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    response = await client_empty.post(
        "/packages/generate",
        json={
            "topic": "Basic cyber hygiene",
            "audience": "new employees",
            "num_pages": 3,
            "num_questions": 4,
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "AI service not configured. Set GEMINI_API_KEY in backend/.env"
    )


async def test_generate_package_returns_yaml_on_success(
    client_empty: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sample_yaml = (
        Path(__file__).resolve().parents[2] / "packages" / "sample-demo.yaml"
    ).read_text(encoding="utf-8")
    mock_generate = AsyncMock(return_value=sample_yaml)
    monkeypatch.setattr("app.routers.packages.generate_package", mock_generate)

    response = await client_empty.post(
        "/packages/generate",
        json={
            "topic": "Fraud prevention",
            "audience": "frontline staff",
            "num_pages": 2,
            "num_questions": 3,
        },
    )

    assert response.status_code == 200
    assert response.json()["yaml_content"] == sample_yaml


async def test_generate_package_passes_request_values_to_service(
    client_empty: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_generate = AsyncMock(return_value="id: demo\n")
    monkeypatch.setattr("app.routers.packages.generate_package", mock_generate)

    payload = {
        "topic": "Data protection essentials",
        "audience": "general learners",
        "num_pages": 5,
        "num_questions": 8,
    }
    response = await client_empty.post("/packages/generate", json=payload)

    assert response.status_code == 200
    mock_generate.assert_awaited_once_with(
        topic=payload["topic"],
        audience=payload["audience"],
        num_pages=payload["num_pages"],
        num_questions=payload["num_questions"],
    )
