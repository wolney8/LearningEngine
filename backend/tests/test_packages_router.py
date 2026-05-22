import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.package import Package
from app.routers.packages import get_packages_cache

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
            "weight": 1.0,
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
    app.dependency_overrides[get_packages_cache] = lambda: cache
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
async def client_empty():
    app.dependency_overrides[get_packages_cache] = lambda: {}
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
