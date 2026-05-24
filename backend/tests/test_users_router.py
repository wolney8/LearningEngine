from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, SQLModel, create_engine

from app.main import app
from app.models.package import Package
from app.routers.packages import get_package_overrides, get_packages_cache
from app.services.db import get_session
from app.services.overrides_loader import PackageOverride

_PACKAGE_SAMPLE = Package.model_validate(
    {
        "id": "sample-demo",
        "title": "Sample Demo Package",
        "description": "Available package for users route tests.",
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

_PACKAGE_UNAVAILABLE = Package.model_validate(
    {
        "id": "unavailable-demo",
        "title": "Unavailable Demo Package",
        "description": "Unavailable package for users route tests.",
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

_PACKAGE_HIDDEN = Package.model_validate(
    {
        "id": "hidden-demo",
        "title": "Hidden Demo Package",
        "description": "Hidden package for users route tests.",
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

    package_cache = {
        "sample-demo": _PACKAGE_SAMPLE,
        "unavailable-demo": _PACKAGE_UNAVAILABLE,
        "hidden-demo": _PACKAGE_HIDDEN,
    }
    package_overrides = {
        "unavailable-demo": PackageOverride(availability="unavailable"),
        "hidden-demo": PackageOverride(availability="hidden"),
    }

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_packages_cache] = lambda: package_cache
    app.dependency_overrides[get_package_overrides] = lambda: package_overrides

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


async def _register_user_and_get_token(
    users_client: AsyncClient,
    *,
    username: str,
    email: str,
) -> str:
    register = await users_client.post(
        "/auth/register",
        json={
            "username": username,
            "email": email,
            "password": "StrongPass123",
        },
    )
    assert register.status_code == 200
    return register.json()["access_token"]


async def test_users_progress_returns_empty_for_new_user(
    users_client: AsyncClient,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="progress-empty",
        email="progress-empty@example.com",
    )

    response = await users_client.get(
        "/users/me/progress",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == []


async def test_users_library_returns_selected_visible_summaries(
    users_client: AsyncClient,
) -> None:
    register = await users_client.post(
        "/auth/register",
        json={
            "username": "library-user",
            "email": "library-user@example.com",
            "password": "StrongPass123",
            "selected_package_ids": ["sample-demo", "unavailable-demo"],
        },
    )
    assert register.status_code == 200
    token = register.json()["access_token"]

    response = await users_client.get(
        "/users/me/library",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    body = response.json()
    assert [item["id"] for item in body] == ["sample-demo", "unavailable-demo"]
    assert body[0]["availability"] == "available"
    assert body[0]["enabled"] is True
    assert body[1]["availability"] == "unavailable"
    assert body[1]["enabled"] is False


async def test_users_library_requires_auth(users_client: AsyncClient) -> None:
    response = await users_client.get("/users/me/library")
    assert response.status_code == 401


async def test_users_library_is_isolated_per_user(users_client: AsyncClient) -> None:
    register_one = await users_client.post(
        "/auth/register",
        json={
            "username": "library-user-one",
            "email": "library-user-one@example.com",
            "password": "StrongPass123",
            "selected_package_ids": ["sample-demo"],
        },
    )
    assert register_one.status_code == 200
    token_one = register_one.json()["access_token"]

    token_two = await _register_user_and_get_token(
        users_client,
        username="library-user-two",
        email="library-user-two@example.com",
    )

    first_user_response = await users_client.get(
        "/users/me/library",
        headers={"Authorization": f"Bearer {token_one}"},
    )
    second_user_response = await users_client.get(
        "/users/me/library",
        headers={"Authorization": f"Bearer {token_two}"},
    )

    assert first_user_response.status_code == 200
    assert [item["id"] for item in first_user_response.json()] == ["sample-demo"]
    assert second_user_response.status_code == 200
    assert second_user_response.json() == []


async def test_users_library_selects_visible_package_for_current_user(
    users_client: AsyncClient,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="library-select",
        email="library-select@example.com",
    )

    response = await users_client.put(
        "/users/me/library/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": "sample-demo",
        "title": "Sample Demo Package",
        "description": "Available package for users route tests.",
        "version": "1.0.0",
        "tags": ["demo"],
        "passing_score": 0.75,
        "page_count": 1,
        "question_count": 1,
        "availability": "available",
        "enabled": True,
        "xp_threshold": None,
        "selected": True,
    }

    library_response = await users_client.get(
        "/users/me/library",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert library_response.status_code == 200
    assert [item["id"] for item in library_response.json()] == ["sample-demo"]


async def test_users_library_select_is_idempotent_when_already_selected(
    users_client: AsyncClient,
) -> None:
    register = await users_client.post(
        "/auth/register",
        json={
            "username": "library-select-idempotent",
            "email": "library-select-idempotent@example.com",
            "password": "StrongPass123",
            "selected_package_ids": ["sample-demo"],
        },
    )
    assert register.status_code == 200
    token = register.json()["access_token"]

    response = await users_client.put(
        "/users/me/library/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["selected"] is True

    library_response = await users_client.get(
        "/users/me/library",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert library_response.status_code == 200
    assert [item["id"] for item in library_response.json()] == ["sample-demo"]


async def test_users_library_select_allows_unavailable_package(
    users_client: AsyncClient,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="library-select-unavailable",
        email="library-select-unavailable@example.com",
    )

    response = await users_client.put(
        "/users/me/library/unavailable-demo",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "unavailable-demo"
    assert body["availability"] == "unavailable"
    assert body["enabled"] is False
    assert body["selected"] is True


@pytest.mark.parametrize("package_id", ["missing-demo", "hidden-demo"])
async def test_users_library_select_rejects_unknown_or_hidden_package(
    users_client: AsyncClient,
    package_id: str,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username=f"library-select-{package_id}",
        email=f"library-select-{package_id}@example.com",
    )

    response = await users_client.put(
        f"/users/me/library/{package_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "message": "package_id contains unknown or hidden package ids",
            "invalid_package_ids": [package_id],
        }
    }


async def test_users_library_deselects_selected_package_for_current_user(
    users_client: AsyncClient,
) -> None:
    register = await users_client.post(
        "/auth/register",
        json={
            "username": "library-remove",
            "email": "library-remove@example.com",
            "password": "StrongPass123",
            "selected_package_ids": ["sample-demo"],
        },
    )
    assert register.status_code == 200
    token = register.json()["access_token"]

    response = await users_client.delete(
        "/users/me/library/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["selected"] is False

    library_response = await users_client.get(
        "/users/me/library",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert library_response.status_code == 200
    assert library_response.json() == []


async def test_users_library_deselect_is_idempotent_when_absent(
    users_client: AsyncClient,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="library-remove-idempotent",
        email="library-remove-idempotent@example.com",
    )

    response = await users_client.delete(
        "/users/me/library/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["selected"] is False


async def test_users_library_selection_requires_auth(users_client: AsyncClient) -> None:
    response = await users_client.put("/users/me/library/sample-demo")
    assert response.status_code == 401


async def test_users_library_deselection_requires_auth(
    users_client: AsyncClient,
) -> None:
    response = await users_client.delete("/users/me/library/sample-demo")
    assert response.status_code == 401


async def test_users_library_selection_is_isolated_per_user(
    users_client: AsyncClient,
) -> None:
    token_one = await _register_user_and_get_token(
        users_client,
        username="library-isolation-one",
        email="library-isolation-one@example.com",
    )
    token_two = await _register_user_and_get_token(
        users_client,
        username="library-isolation-two",
        email="library-isolation-two@example.com",
    )

    select_response = await users_client.put(
        "/users/me/library/sample-demo",
        headers={"Authorization": f"Bearer {token_one}"},
    )
    assert select_response.status_code == 200

    first_user_response = await users_client.get(
        "/users/me/library",
        headers={"Authorization": f"Bearer {token_one}"},
    )
    second_user_response = await users_client.get(
        "/users/me/library",
        headers={"Authorization": f"Bearer {token_two}"},
    )

    assert [item["id"] for item in first_user_response.json()] == ["sample-demo"]
    assert second_user_response.json() == []


async def test_users_catalogue_returns_visible_packages_with_selected_flag(
    users_client: AsyncClient,
) -> None:
    register = await users_client.post(
        "/auth/register",
        json={
            "username": "catalogue-user",
            "email": "catalogue-user@example.com",
            "password": "StrongPass123",
            "selected_package_ids": ["sample-demo"],
        },
    )
    assert register.status_code == 200
    token = register.json()["access_token"]

    response = await users_client.get(
        "/users/me/catalogue",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    by_id = {item["id"]: item for item in response.json()}
    assert set(by_id.keys()) == {"sample-demo", "unavailable-demo"}
    assert by_id["sample-demo"]["selected"] is True
    assert by_id["sample-demo"]["availability"] == "available"
    assert by_id["sample-demo"]["enabled"] is True
    assert by_id["unavailable-demo"]["selected"] is False
    assert by_id["unavailable-demo"]["availability"] == "unavailable"
    assert by_id["unavailable-demo"]["enabled"] is False


async def test_users_catalogue_requires_auth(users_client: AsyncClient) -> None:
    response = await users_client.get("/users/me/catalogue")
    assert response.status_code == 401


async def test_users_progress_upserts_latest_result_for_package(
    users_client: AsyncClient,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="progress-upsert",
        email="progress-upsert@example.com",
    )

    create_response = await users_client.post(
        "/users/me/progress/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
        json={"latest_weighted_score": 0.65, "completed": False},
    )
    assert create_response.status_code == 200
    created_body = create_response.json()
    assert created_body["package_id"] == "sample-demo"
    assert created_body["latest_weighted_score"] == 0.65
    assert created_body["completed"] is False
    assert created_body["attempt_count"] == 1
    assert created_body["first_completed_at"] is None

    update_response = await users_client.post(
        "/users/me/progress/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
        json={"latest_weighted_score": 0.92, "completed": True},
    )
    assert update_response.status_code == 200
    updated_body = update_response.json()
    assert updated_body["package_id"] == "sample-demo"
    assert updated_body["latest_weighted_score"] == 0.92
    assert updated_body["completed"] is True
    assert updated_body["attempt_count"] == 2
    assert updated_body["first_completed_at"] is not None
    assert updated_body["updated_at"] != created_body["updated_at"]

    get_response = await users_client.get(
        "/users/me/progress",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_response.status_code == 200
    assert get_response.json() == [updated_body]


async def test_users_progress_attempt_count_can_be_overwritten(
    users_client: AsyncClient,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="progress-attempt-overwrite",
        email="progress-attempt-overwrite@example.com",
    )

    create_response = await users_client.post(
        "/users/me/progress/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
        json={"latest_weighted_score": 0.55, "completed": False},
    )
    assert create_response.status_code == 200
    assert create_response.json()["attempt_count"] == 1

    overwrite_response = await users_client.post(
        "/users/me/progress/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "latest_weighted_score": 0.77,
            "completed": False,
            "attempt_count": 10,
        },
    )
    assert overwrite_response.status_code == 200
    assert overwrite_response.json()["attempt_count"] == 10


async def test_users_progress_first_completed_at_is_set_once(
    users_client: AsyncClient,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="progress-first-completed",
        email="progress-first-completed@example.com",
    )

    incomplete_response = await users_client.post(
        "/users/me/progress/set-once-pkg",
        headers={"Authorization": f"Bearer {token}"},
        json={"latest_weighted_score": 0.45, "completed": False},
    )
    assert incomplete_response.status_code == 200
    assert incomplete_response.json()["first_completed_at"] is None

    first_completion_response = await users_client.post(
        "/users/me/progress/set-once-pkg",
        headers={"Authorization": f"Bearer {token}"},
        json={"latest_weighted_score": 0.9, "completed": True},
    )
    assert first_completion_response.status_code == 200
    first_completed_at = first_completion_response.json()["first_completed_at"]
    assert first_completed_at is not None

    second_completion_response = await users_client.post(
        "/users/me/progress/set-once-pkg",
        headers={"Authorization": f"Bearer {token}"},
        json={"latest_weighted_score": 0.95, "completed": True},
    )
    assert second_completion_response.status_code == 200
    assert second_completion_response.json()["first_completed_at"] == first_completed_at


async def test_users_progress_is_isolated_per_user(users_client: AsyncClient) -> None:
    token_one = await _register_user_and_get_token(
        users_client,
        username="progress-user-one",
        email="progress-user-one@example.com",
    )
    token_two = await _register_user_and_get_token(
        users_client,
        username="progress-user-two",
        email="progress-user-two@example.com",
    )

    write_first = await users_client.post(
        "/users/me/progress/pkg-one",
        headers={"Authorization": f"Bearer {token_one}"},
        json={"latest_weighted_score": 0.8, "completed": True},
    )
    assert write_first.status_code == 200

    write_second = await users_client.post(
        "/users/me/progress/pkg-two",
        headers={"Authorization": f"Bearer {token_two}"},
        json={"latest_weighted_score": 0.55, "completed": False},
    )
    assert write_second.status_code == 200

    first_user_read = await users_client.get(
        "/users/me/progress",
        headers={"Authorization": f"Bearer {token_one}"},
    )
    second_user_read = await users_client.get(
        "/users/me/progress",
        headers={"Authorization": f"Bearer {token_two}"},
    )

    assert first_user_read.status_code == 200
    assert second_user_read.status_code == 200

    first_payload = first_user_read.json()
    second_payload = second_user_read.json()
    assert len(first_payload) == 1
    assert len(second_payload) == 1
    assert first_payload[0]["package_id"] == "pkg-one"
    assert second_payload[0]["package_id"] == "pkg-two"
    assert first_payload[0]["attempt_count"] == 1
    assert second_payload[0]["attempt_count"] == 1


async def test_users_xp_read_and_update_persists(users_client: AsyncClient) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="xp-user",
        email="xp-user@example.com",
    )

    initial_response = await users_client.get(
        "/users/me/xp",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert initial_response.status_code == 200
    assert initial_response.json() == {"xp": 0}

    update_response = await users_client.put(
        "/users/me/xp",
        headers={"Authorization": f"Bearer {token}"},
        json={"xp": 125},
    )
    assert update_response.status_code == 200
    assert update_response.json() == {"xp": 125}

    second_read = await users_client.get(
        "/users/me/xp",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert second_read.status_code == 200
    assert second_read.json() == {"xp": 125}

    profile_response = await users_client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert profile_response.status_code == 200
    assert profile_response.json()["xp"] == 125


async def test_users_xp_update_requires_valid_payload(
    users_client: AsyncClient,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="xp-invalid",
        email="xp-invalid@example.com",
    )

    response = await users_client.put(
        "/users/me/xp",
        headers={"Authorization": f"Bearer {token}"},
        json={"xp": -5},
    )

    assert response.status_code == 422


async def test_users_streak_initial_state_for_new_user(
    users_client: AsyncClient,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="streak-initial",
        email="streak-initial@example.com",
    )

    response = await users_client.get(
        "/users/me/streak",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "streak_count": 0,
        "last_practised_date": None,
    }


async def test_users_streak_first_practice_day_sets_streak_to_one(
    users_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="streak-first-day",
        email="streak-first-day@example.com",
    )
    monkeypatch.setattr("app.routers.users._utc_today", lambda: date(2026, 5, 24))

    response = await users_client.post(
        "/users/me/streak/mark-practised",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "streak_count": 1,
        "last_practised_date": "2026-05-24",
    }


async def test_users_streak_consecutive_day_increments(
    users_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="streak-consecutive",
        email="streak-consecutive@example.com",
    )
    monkeypatch.setattr("app.routers.users._utc_today", lambda: date(2026, 5, 24))

    first = await users_client.post(
        "/users/me/streak/mark-practised",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert first.status_code == 200
    assert first.json()["streak_count"] == 1

    monkeypatch.setattr("app.routers.users._utc_today", lambda: date(2026, 5, 25))
    second = await users_client.post(
        "/users/me/streak/mark-practised",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert second.status_code == 200
    assert second.json() == {
        "streak_count": 2,
        "last_practised_date": "2026-05-25",
    }


async def test_users_streak_gap_resets_to_one(
    users_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="streak-gap-reset",
        email="streak-gap-reset@example.com",
    )
    monkeypatch.setattr("app.routers.users._utc_today", lambda: date(2026, 5, 24))

    first = await users_client.post(
        "/users/me/streak/mark-practised",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert first.status_code == 200
    assert first.json()["streak_count"] == 1

    monkeypatch.setattr("app.routers.users._utc_today", lambda: date(2026, 5, 27))
    second = await users_client.post(
        "/users/me/streak/mark-practised",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert second.status_code == 200
    assert second.json() == {
        "streak_count": 1,
        "last_practised_date": "2026-05-27",
    }


async def test_users_streak_same_day_calls_are_idempotent(
    users_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="streak-idempotent",
        email="streak-idempotent@example.com",
    )
    monkeypatch.setattr("app.routers.users._utc_today", lambda: date(2026, 5, 24))

    first = await users_client.post(
        "/users/me/streak/mark-practised",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert first.status_code == 200
    assert first.json() == {
        "streak_count": 1,
        "last_practised_date": "2026-05-24",
    }

    second = await users_client.post(
        "/users/me/streak/mark-practised",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert second.status_code == 200
    assert second.json() == {
        "streak_count": 1,
        "last_practised_date": "2026-05-24",
    }

    read_back = await users_client.get(
        "/users/me/streak",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert read_back.status_code == 200
    assert read_back.json() == {
        "streak_count": 1,
        "last_practised_date": "2026-05-24",
    }


async def test_users_streak_is_isolated_per_user(
    users_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token_one = await _register_user_and_get_token(
        users_client,
        username="streak-user-one",
        email="streak-user-one@example.com",
    )
    token_two = await _register_user_and_get_token(
        users_client,
        username="streak-user-two",
        email="streak-user-two@example.com",
    )

    monkeypatch.setattr("app.routers.users._utc_today", lambda: date(2026, 5, 24))
    first_user_mark = await users_client.post(
        "/users/me/streak/mark-practised",
        headers={"Authorization": f"Bearer {token_one}"},
    )
    assert first_user_mark.status_code == 200
    assert first_user_mark.json()["streak_count"] == 1

    monkeypatch.setattr("app.routers.users._utc_today", lambda: date(2026, 5, 25))
    second_user_mark = await users_client.post(
        "/users/me/streak/mark-practised",
        headers={"Authorization": f"Bearer {token_two}"},
    )
    assert second_user_mark.status_code == 200
    assert second_user_mark.json()["streak_count"] == 1

    first_user_read = await users_client.get(
        "/users/me/streak",
        headers={"Authorization": f"Bearer {token_one}"},
    )
    second_user_read = await users_client.get(
        "/users/me/streak",
        headers={"Authorization": f"Bearer {token_two}"},
    )

    assert first_user_read.status_code == 200
    assert second_user_read.status_code == 200
    assert first_user_read.json() == {
        "streak_count": 1,
        "last_practised_date": "2026-05-24",
    }
    assert second_user_read.json() == {
        "streak_count": 1,
        "last_practised_date": "2026-05-25",
    }
