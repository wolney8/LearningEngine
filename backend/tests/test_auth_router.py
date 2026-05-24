from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, SQLModel, create_engine

from app.main import app
from app.services.db import get_session


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

    app.dependency_overrides[get_session] = session_override

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
