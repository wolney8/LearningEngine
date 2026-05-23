from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, SQLModel, create_engine

from app.main import app
from app.services.db import get_session


@pytest.fixture
async def users_client(tmp_path):
    db_path = tmp_path / "users-test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)

    def session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


async def test_users_me_returns_authenticated_user(users_client: AsyncClient) -> None:
    register = await users_client.post(
        "/auth/register",
        json={
            "username": "profile-user",
            "email": "profile-user@example.com",
            "password": "StrongPass123",
        },
    )
    token = register.json()["access_token"]

    response = await users_client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "profile-user"
    assert body["email"] == "profile-user@example.com"
    assert body["role"] == "student"


async def test_users_me_rejects_invalid_token(users_client: AsyncClient) -> None:
    response = await users_client.get(
        "/users/me",
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired token"}
