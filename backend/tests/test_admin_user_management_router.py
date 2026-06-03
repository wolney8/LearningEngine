from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, SQLModel, create_engine, select

from app.main import app
from app.models.user import (
    AdminAuditLog,
    SpendHistory,
    User,
    UserLibraryItem,
    UserTestResult,
)
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


def _get_user(engine, user_id: int) -> User:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.id == user_id)).first()
        assert user is not None
        return user


def _read_admin_audit_logs(engine) -> list[AdminAuditLog]:
    with Session(engine) as session:
        return session.exec(
            select(AdminAuditLog).order_by(AdminAuditLog.id)
        ).all()


def _count_rows_for_user(engine, model, user_id: int) -> int:
    with Session(engine) as session:
        return len(session.exec(select(model).where(model.user_id == user_id)).all())


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
    assert set(body[0].keys()) == {
        "id",
        "username",
        "email",
        "role",
        "xp",
        "pending_bonus_xp",
        "pending_bonus_reason",
        "created_at",
    }
    assert all(isinstance(item["xp"], int) for item in body)
    assert all(isinstance(item["pending_bonus_xp"], int) for item in body)


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


async def test_admin_can_set_reset_and_bonus_user_xp(admin_users_client) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-xp",
        email="admin-xp@example.com",
    )
    _set_role(engine, admin_id, "admin")

    _, student_id = await _register_user_and_get_identity(
        client,
        username="student-xp",
        email="student-xp@example.com",
    )

    set_response = await client.patch(
        f"/admin/users/{student_id}/xp/set",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"xp": 250},
    )
    assert set_response.status_code == 200
    assert set_response.json()["xp"] == 250
    assert set_response.json()["pending_bonus_xp"] == 0
    assert set_response.json()["pending_bonus_reason"] is None

    bonus_response = await client.post(
        f"/admin/users/{student_id}/xp/bonus",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"xp": 40, "reason": "Quiz champion"},
    )
    assert bonus_response.status_code == 200
    assert bonus_response.json()["xp"] == 290
    assert bonus_response.json()["pending_bonus_xp"] == 40
    assert bonus_response.json()["pending_bonus_reason"] == "Quiz champion"

    reset_response = await client.post(
        f"/admin/users/{student_id}/xp/reset",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert reset_response.status_code == 200
    assert reset_response.json()["xp"] == 0
    assert reset_response.json()["pending_bonus_xp"] == 0
    assert reset_response.json()["pending_bonus_reason"] is None


async def test_non_admin_cannot_modify_user_xp(admin_users_client) -> None:
    client, _ = admin_users_client
    student_token, student_id = await _register_user_and_get_identity(
        client,
        username="student-no-admin",
        email="student-no-admin@example.com",
    )

    response = await client.patch(
        f"/admin/users/{student_id}/xp/set",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"xp": 99},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin access required"}


async def test_admin_can_reset_user_progress_without_resetting_xp(
    admin_users_client,
) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-progress-only",
        email="admin-progress-only@example.com",
    )
    _set_role(engine, admin_id, "admin")

    student_token, student_id = await _register_user_and_get_identity(
        client,
        username="student-progress-only",
        email="student-progress-only@example.com",
    )

    set_xp_response = await client.patch(
        f"/admin/users/{student_id}/xp/set",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"xp": 230},
    )
    assert set_xp_response.status_code == 200

    progress_one = await client.post(
        "/users/me/progress/sample-demo",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"latest_weighted_score": 0.9, "completed": True},
    )
    assert progress_one.status_code == 200
    progress_two = await client.post(
        "/users/me/progress/second-demo",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"latest_weighted_score": 0.35, "completed": False},
    )
    assert progress_two.status_code == 200

    reset_response = await client.post(
        f"/admin/users/{student_id}/progress/reset",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert reset_response.status_code == 200
    assert reset_response.json() == {
        "id": student_id,
        "username": "student-progress-only",
        "role": "student",
        "xp": 230,
        "pending_bonus_xp": 0,
        "pending_bonus_reason": None,
        "cleared_progress_count": 2,
        "reset_xp": False,
    }

    progress_after_reset = await client.get(
        "/users/me/progress",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert progress_after_reset.status_code == 200
    assert progress_after_reset.json() == []


async def test_admin_can_reset_user_progress_and_xp_together(
    admin_users_client,
) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-progress-plus-xp",
        email="admin-progress-plus-xp@example.com",
    )
    _set_role(engine, admin_id, "admin")

    student_token, student_id = await _register_user_and_get_identity(
        client,
        username="student-progress-plus-xp",
        email="student-progress-plus-xp@example.com",
    )

    bonus_response = await client.post(
        f"/admin/users/{student_id}/xp/bonus",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"xp": 70, "reason": "Milestone complete"},
    )
    assert bonus_response.status_code == 200

    progress = await client.post(
        "/users/me/progress/sample-demo",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"latest_weighted_score": 0.55, "completed": False},
    )
    assert progress.status_code == 200

    reset_response = await client.post(
        f"/admin/users/{student_id}/progress/reset",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reset_xp": True},
    )

    assert reset_response.status_code == 200
    assert reset_response.json() == {
        "id": student_id,
        "username": "student-progress-plus-xp",
        "role": "student",
        "xp": 0,
        "pending_bonus_xp": 0,
        "pending_bonus_reason": None,
        "cleared_progress_count": 1,
        "reset_xp": True,
    }

    student = _get_user(engine, student_id)
    assert student.xp == 0
    assert student.pending_bonus_xp == 0
    assert student.pending_bonus_reason is None

    progress_after_reset = await client.get(
        "/users/me/progress",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert progress_after_reset.status_code == 200
    assert progress_after_reset.json() == []


async def test_non_admin_cannot_reset_user_progress(admin_users_client) -> None:
    client, _ = admin_users_client
    student_token, student_id = await _register_user_and_get_identity(
        client,
        username="student-no-progress-admin",
        email="student-no-progress-admin@example.com",
    )

    response = await client.post(
        f"/admin/users/{student_id}/progress/reset",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"reset_xp": True},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin access required"}


async def test_non_admin_cannot_list_admin_audit_logs(admin_users_client) -> None:
    client, _ = admin_users_client
    student_token, _ = await _register_user_and_get_identity(
        client,
        username="student-no-audit-admin",
        email="student-no-audit-admin@example.com",
    )

    response = await client.get(
        "/admin/audit-logs",
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin access required"}


async def test_admin_user_mutations_create_audit_logs(admin_users_client) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-audit",
        email="admin-audit@example.com",
    )
    _set_role(engine, admin_id, "admin")

    _, student_id = await _register_user_and_get_identity(
        client,
        username="student-audit",
        email="student-audit@example.com",
    )

    role_response = await client.patch(
        f"/admin/users/{student_id}/role",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "admin"},
    )
    assert role_response.status_code == 200

    xp_set_response = await client.patch(
        f"/admin/users/{student_id}/xp/set",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"xp": 120},
    )
    assert xp_set_response.status_code == 200

    xp_bonus_response = await client.post(
        f"/admin/users/{student_id}/xp/bonus",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"xp": 30, "reason": "Excellent work"},
    )
    assert xp_bonus_response.status_code == 200

    xp_reset_response = await client.post(
        f"/admin/users/{student_id}/xp/reset",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert xp_reset_response.status_code == 200

    progress_reset_response = await client.post(
        f"/admin/users/{student_id}/progress/reset",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reset_xp": True},
    )
    assert progress_reset_response.status_code == 200

    logs_response = await client.get(
        "/admin/audit-logs?limit=3",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert logs_response.status_code == 200
    logs_body = logs_response.json()
    assert len(logs_body) == 3
    assert [entry["action"] for entry in logs_body] == [
        "user.progress_reset",
        "user.xp_reset",
        "user.xp_bonus_applied",
    ]
    assert all(entry["actor_user_id"] == admin_id for entry in logs_body)
    assert all(entry["target_user_id"] == student_id for entry in logs_body)

    persisted_logs = _read_admin_audit_logs(engine)
    assert [entry.action for entry in persisted_logs] == [
        "user.role_changed",
        "user.xp_set",
        "user.xp_bonus_applied",
        "user.xp_reset",
        "user.progress_reset",
    ]


async def test_admin_audit_logs_support_action_actor_and_date_filters(
    admin_users_client,
) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-filter",
        email="admin-filter@example.com",
    )
    _set_role(engine, admin_id, "admin")

    _, other_user_id = await _register_user_and_get_identity(
        client,
        username="other-filter",
        email="other-filter@example.com",
    )

    base_time = datetime(2026, 5, 30, 12, 0, tzinfo=timezone.utc)
    with Session(engine) as session:
        session.add(
            AdminAuditLog(
                actor_user_id=admin_id,
                action="settings.updated",
                details_json='{"changed_keys": ["celebration_effects.enabled"]}',
                created_at=base_time - timedelta(minutes=10),
            )
        )
        session.add(
            AdminAuditLog(
                actor_user_id=admin_id,
                action="package.archived",
                package_id="sample-demo",
                details_json="{}",
                created_at=base_time,
            )
        )
        session.add(
            AdminAuditLog(
                actor_user_id=other_user_id,
                action="settings.updated",
                details_json='{"changed_keys": ["xp.first_completion_bonus"]}',
                created_at=base_time + timedelta(minutes=10),
            )
        )
        session.commit()

    filtered_response = await client.get(
        "/admin/audit-logs",
        headers={"Authorization": f"Bearer {admin_token}"},
        params={
            "action": "settings.updated",
            "actor_user_id": str(admin_id),
            "from": (base_time - timedelta(minutes=30)).isoformat(),
            "until": (base_time + timedelta(minutes=1)).isoformat(),
            "limit": "50",
        },
    )

    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert len(filtered_body) == 1
    assert filtered_body[0]["action"] == "settings.updated"
    assert filtered_body[0]["actor_user_id"] == admin_id

    invalid_range_response = await client.get(
        "/admin/audit-logs",
        headers={"Authorization": f"Bearer {admin_token}"},
        params={
            "from": (base_time + timedelta(hours=1)).isoformat(),
            "until": (base_time - timedelta(hours=1)).isoformat(),
        },
    )
    assert invalid_range_response.status_code == 422


async def test_admin_can_delete_user_and_related_records(admin_users_client) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-delete-user",
        email="admin-delete-user@example.com",
    )
    _set_role(engine, admin_id, "admin")

    student_token, student_id = await _register_user_and_get_identity(
        client,
        username="student-delete-user",
        email="student-delete-user@example.com",
    )

    progress_response = await client.post(
        "/users/me/progress/sample-demo",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"latest_weighted_score": 0.8, "completed": True},
    )
    assert progress_response.status_code == 200

    with Session(engine) as session:
        session.add(
            UserLibraryItem(
                user_id=student_id,
                package_id="sample-demo",
                status="selected",
            )
        )
        session.add(
            SpendHistory(
                user_id=student_id,
                action="package_unlock",
                package_id="sample-demo",
                difficulty=None,
                cost=100,
                success=True,
            )
        )
        session.add(
            AdminAuditLog(
                actor_user_id=admin_id,
                action="user.reviewed",
                target_user_id=student_id,
                details_json='{"note":"before delete"}',
            )
        )
        session.commit()

    delete_response = await client.delete(
        f"/admin/users/{student_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert delete_response.status_code == 200
    assert delete_response.json() == {
        "id": student_id,
        "username": "student-delete-user",
        "deleted_progress_count": 1,
        "deleted_library_count": 1,
        "deleted_spend_history_count": 1,
        "deleted_audit_log_count": 1,
    }

    with Session(engine) as session:
        deleted_user = session.exec(select(User).where(User.id == student_id)).first()
        assert deleted_user is None

    assert _count_rows_for_user(engine, UserTestResult, student_id) == 0
    assert _count_rows_for_user(engine, UserLibraryItem, student_id) == 0
    assert _count_rows_for_user(engine, SpendHistory, student_id) == 0

    persisted_logs = _read_admin_audit_logs(engine)
    assert [entry.action for entry in persisted_logs] == ["user.deleted"]
    assert persisted_logs[0].actor_user_id == admin_id
    assert persisted_logs[0].target_user_id is None


async def test_admin_cannot_delete_currently_signed_in_admin(
    admin_users_client,
) -> None:
    client, engine = admin_users_client
    admin_token, admin_id = await _register_user_and_get_identity(
        client,
        username="admin-self-delete",
        email="admin-self-delete@example.com",
    )
    _set_role(engine, admin_id, "admin")

    _, second_admin_id = await _register_user_and_get_identity(
        client,
        username="admin-second-delete",
        email="admin-second-delete@example.com",
    )
    _set_role(engine, second_admin_id, "admin")

    response = await client.delete(
        f"/admin/users/{admin_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Cannot delete the currently signed-in admin user"
    }
    assert _get_role(engine, admin_id) == "admin"


async def test_non_admin_cannot_delete_user(admin_users_client) -> None:
    client, _ = admin_users_client
    student_token, student_id = await _register_user_and_get_identity(
        client,
        username="student-delete-no-admin",
        email="student-delete-no-admin@example.com",
    )

    response = await client.delete(
        f"/admin/users/{student_id}",
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin access required"}
