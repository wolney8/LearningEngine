from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, SQLModel, create_engine

from app.main import app
from app.models.package import Package
from app.models.user import User
from app.routers.packages import get_package_overrides, get_packages_cache
from app.routers.users import require_admin_user
from app.services.db import get_session
from app.services.overrides_loader import PackageOverride

_SAMPLE_PACKAGE = Package.model_validate(
    {
        "id": "sample-demo",
        "title": "Sample Demo Package",
        "description": "A demo package for auth tests.",
        "version": "1.0.0",
        "tags": ["demo"],
        "passing_score": 0.75,
        "pages": [{"id": "p1", "title": "Page 1", "content": "Content."}],
        "questions": [
            {
                "id": "q1",
                "text": "Question?",
                "answers": [
                    {"id": "a", "text": "Yes"},
                    {"id": "b", "text": "No"},
                ],
                "correct_answer": "a",
                "weight": 100.0,
                "feedback": "Correct.",
                "revision_page_ids": ["p1"],
            }
        ],
    }
)


@pytest.fixture
async def auth_client(tmp_path):
    db_path = tmp_path / "auth-test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)

    def session_override():
        with Session(engine) as session:
            yield session

    package_cache = {"sample-demo": _SAMPLE_PACKAGE}
    package_overrides: dict[str, PackageOverride] = {}

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_packages_cache] = lambda: package_cache
    app.dependency_overrides[get_package_overrides] = lambda: package_overrides

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


async def test_register_creates_user_and_returns_bearer_token(
    auth_client: AsyncClient,
) -> None:
    response = await auth_client.post(
        "/auth/register",
        json={
            "username": "learner1",
            "email": "learner1@example.com",
            "password": "StrongPass123",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str)
    assert body["user"]["username"] == "learner1"
    assert body["user"]["email"] == "learner1@example.com"


async def test_register_rejects_duplicate_username(auth_client: AsyncClient) -> None:
    payload = {
        "username": "duplicate",
        "email": "duplicate@example.com",
        "password": "StrongPass123",
    }
    first = await auth_client.post("/auth/register", json=payload)
    assert first.status_code == 200

    second = await auth_client.post(
        "/auth/register",
        json={
            "username": "duplicate",
            "email": "new-mail@example.com",
            "password": "StrongPass123",
        },
    )
    assert second.status_code == 409
    assert second.json() == {"detail": "Username is already taken"}


async def test_register_rejects_duplicate_email(auth_client: AsyncClient) -> None:
    payload = {
        "username": "first-user",
        "email": "dupe-mail@example.com",
        "password": "StrongPass123",
    }
    first = await auth_client.post("/auth/register", json=payload)
    assert first.status_code == 200

    second = await auth_client.post(
        "/auth/register",
        json={
            "username": "second-user",
            "email": "dupe-mail@example.com",
            "password": "StrongPass123",
        },
    )
    assert second.status_code == 409
    assert second.json() == {"detail": "Email is already registered"}


async def test_register_accepts_selected_package_ids_and_deduplicates(
    auth_client: AsyncClient,
) -> None:
    response = await auth_client.post(
        "/auth/register",
        json={
            "username": "selected-user",
            "email": "selected-user@example.com",
            "password": "StrongPass123",
            "selected_package_ids": ["sample-demo", "sample-demo"],
        },
    )
    assert response.status_code == 200

    token = response.json()["access_token"]
    library_response = await auth_client.get(
        "/users/me/library",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert library_response.status_code == 200
    assert [item["id"] for item in library_response.json()] == ["sample-demo"]


async def test_register_rejects_unknown_selected_package_ids(
    auth_client: AsyncClient,
) -> None:
    response = await auth_client.post(
        "/auth/register",
        json={
            "username": "unknown-selected",
            "email": "unknown-selected@example.com",
            "password": "StrongPass123",
            "selected_package_ids": ["missing-package"],
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["message"] == (
        "selected_package_ids contains unknown or hidden package ids"
    )
    assert detail["invalid_package_ids"] == ["missing-package"]


async def test_register_rejects_hidden_selected_package_ids(
    auth_client: AsyncClient,
) -> None:
    app.dependency_overrides[get_package_overrides] = lambda: {
        "sample-demo": PackageOverride(availability="hidden")
    }

    response = await auth_client.post(
        "/auth/register",
        json={
            "username": "hidden-selected",
            "email": "hidden-selected@example.com",
            "password": "StrongPass123",
            "selected_package_ids": ["sample-demo"],
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["message"] == (
        "selected_package_ids contains unknown or hidden package ids"
    )
    assert detail["invalid_package_ids"] == ["sample-demo"]


async def test_login_works_with_username(auth_client: AsyncClient) -> None:
    register = await auth_client.post(
        "/auth/register",
        json={
            "username": "login-user",
            "email": "login-user@example.com",
            "password": "StrongPass123",
        },
    )
    assert register.status_code == 200

    response = await auth_client.post(
        "/auth/login",
        json={
            "username_or_email": "login-user",
            "password": "StrongPass123",
        },
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"


async def test_login_rejects_invalid_password(auth_client: AsyncClient) -> None:
    await auth_client.post(
        "/auth/register",
        json={
            "username": "wrong-pass",
            "email": "wrong-pass@example.com",
            "password": "StrongPass123",
        },
    )

    response = await auth_client.post(
        "/auth/login",
        json={
            "username_or_email": "wrong-pass",
            "password": "IncorrectPass999",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username/email or password"}


async def test_login_returns_bonus_xp_notice_once_after_admin_grant(
    auth_client: AsyncClient,
) -> None:
    register_response = await auth_client.post(
        "/auth/register",
        json={
            "username": "bonus-user",
            "email": "bonus-user@example.com",
            "password": "StrongPass123",
        },
    )
    assert register_response.status_code == 200
    user_id = register_response.json()["user"]["id"]

    app.dependency_overrides[require_admin_user] = lambda: User(
        id=999,
        username="admin",
        email="admin@example.com",
        hashed_password="x",
        role="admin",
    )

    bonus_response = await auth_client.post(
        f"/admin/users/{user_id}/xp/bonus",
        json={"xp": 35, "reason": "Excellent progression"},
    )
    assert bonus_response.status_code == 200
    assert bonus_response.json()["xp"] == 35

    app.dependency_overrides.pop(require_admin_user, None)

    first_login = await auth_client.post(
        "/auth/login",
        json={
            "username_or_email": "bonus-user",
            "password": "StrongPass123",
        },
    )
    assert first_login.status_code == 200
    assert first_login.json()["user"]["bonus_xp_notice"] == {
        "xp": 35,
        "reason": "Excellent progression",
    }

    second_login = await auth_client.post(
        "/auth/login",
        json={
            "username_or_email": "bonus-user",
            "password": "StrongPass123",
        },
    )
    assert second_login.status_code == 200
    assert second_login.json()["user"]["bonus_xp_notice"] is None
