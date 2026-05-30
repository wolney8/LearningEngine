from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, SQLModel, create_engine, select

from app.main import app
from app.models.user import User
from app.routers.packages import get_package_overrides, get_packages_cache
from app.services.db import get_session


@pytest.fixture
async def admin_users_client(tmp_path):
    db_path = tmp_path / "admin-users-test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)

    def session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_packages_cache] = lambda: {}
    app.dependency_overrides[get_package_overrides] = lambda: {}

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client, engine

    app.dependency_overrides.clear()


async def _register_user_and_get_identity(
    client: AsyncClient,
    *,
    username: str,
    email: str,
) -> tuple[str, int]:
    response = await client.post(
        "/auth/register",
        json={
            "username": username,
            "email": email,
            "password": "StrongPass123",
        },
    )
    assert response.status_code == 200
    body = response.json()
    return body["access_token"], body["user"]["id"]


def _set_role(engine, user_id: int, role: str) -> None:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.id == user_id)).first()
        assert user is not None
        user.role = role
        session.add(user)
        session.commit()


def _get_role(engine, user_id: int) -> str:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.id == user_id)).first()
        assert user is not None
        return user.role


async def test_admin_can_list_users(admin_users_client) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-list",
        email="admin-list@example.com",
    )
    _set_role(engine, admin_id, "admin")

    await _register_user_and_get_identity(
        client,
        username="student-list",
        email="student-list@example.com",
    )

    response = await client.get(
        "/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert {item["username"] for item in body} == {"admin-list", "student-list"}
    assert {item["role"] for item in body} == {"admin", "student"}
    assert set(body[0].keys()) == {"id", "username", "email", "role", "created_at"}


async def test_non_admin_cannot_list_users(admin_users_client) -> None:
    client, _ = admin_users_client
    student_token, _ = await _register_user_and_get_identity(
        client,
        username="student-only",
        email="student-only@example.com",
    )

    response = await client.get(
        "/admin/users",
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin access required"}


async def test_admin_can_update_user_role(admin_users_client) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-update",
        email="admin-update@example.com",
    )
    _set_role(engine, admin_id, "admin")

    _, student_id = await _register_user_and_get_identity(
        client,
        username="student-update",
        email="student-update@example.com",
    )

    response = await client.patch(
        f"/admin/users/{student_id}/role",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "admin"},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    assert _get_role(engine, student_id) == "admin"


async def test_cannot_demote_last_admin(admin_users_client) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-last",
        email="admin-last@example.com",
    )
    _set_role(engine, admin_id, "admin")

    response = await client.patch(
        f"/admin/users/{admin_id}/role",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "student"},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Cannot remove admin role from the last remaining admin user"
    }
    assert _get_role(engine, admin_id) == "admin"
