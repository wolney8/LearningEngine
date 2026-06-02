from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, SQLModel, create_engine, select

from app.main import app
from app.models.package import Package
from app.models.settings import GameSettings
from app.models.user import SpendHistory
from app.routers.packages import get_package_overrides, get_packages_cache
from app.routers.settings import get_settings
from app.services.db import get_session
from app.services.overrides_loader import PackageOverride

_PACKAGE_SAMPLE = Package.model_validate(
    {
        "id": "sample-demo",
        "title": "Sample Demo Package",
        "description": "Available package for XP spend tests.",
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
        "description": "Unavailable package for XP spend tests.",
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
        "description": "Hidden package for XP spend tests.",
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
    db_path = tmp_path / "xp-spend-test.db"
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


def _settings_payload(*, spend_enabled: bool) -> dict:
    return {
        "version": 1,
        "xp": {
            "lesson_base_xp_per_correct": 10,
            "base_xp_per_level": 500,
            "first_completion_bonus": 20,
            "attempt_multipliers": {"1": 1.0, "2": 0.5, "3": 0.25},
            "hard_expert_exit_penalty": 50,
            "hard_expert_low_answer_penalty": 50,
            "min_correct_for_xp": {
                "easy": 2,
                "normal": 2,
                "hard": 0,
                "expert": 0,
            },
        },
        "difficulty": {
            "seconds_per_question": {
                "easy": 90,
                "normal": 45,
                "hard": 20,
                "expert": 10,
            },
            "xp_multiplier": {
                "easy": 0.5,
                "normal": 1.0,
                "hard": 1.5,
                "expert": 2.0,
            },
        },
        "spend_economy": {
            "enabled": spend_enabled,
            "allow_non_admin_ai_generation_spend": False,
            "costs": {
                "generate_ai_course": 500,
                "refresh_stale_course": 300,
                "increase_difficulty_cap": 200,
                "unlock_hidden_package": 250,
            },
        },
    }


def _set_spend_economy_enabled(enabled: bool) -> None:
    app.dependency_overrides[get_settings] = lambda: GameSettings.model_validate(
        _settings_payload(spend_enabled=enabled)
    )


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


async def _set_user_xp(users_client: AsyncClient, token: str, xp: int) -> None:
    response = await users_client.put(
        "/users/me/xp",
        headers={"Authorization": f"Bearer {token}"},
        json={"xp": xp},
    )
    assert response.status_code == 200
    assert response.json() == {"xp": xp}


async def _get_user_id(users_client: AsyncClient, token: str) -> int:
    response = await users_client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return int(response.json()["id"])


@contextmanager
def _db_session_from_override() -> Iterator[Session]:
    session_dependency = app.dependency_overrides[get_session]
    session_generator = session_dependency()
    session = next(session_generator)
    try:
        yield session
    finally:
        try:
            next(session_generator)
        except StopIteration:
            pass


async def test_spend_economy_disabled_returns_423(users_client: AsyncClient) -> None:
    _set_spend_economy_enabled(False)
    token = await _register_user_and_get_token(
        users_client,
        username="spend-disabled",
        email="spend-disabled@example.com",
    )
    await _set_user_xp(users_client, token, 500)

    response = await users_client.post(
        "/users/me/xp/spend",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "difficulty_unlock",
            "package_id": "sample-demo",
            "difficulty": "hard",
        },
    )

    assert response.status_code == 423


async def test_spend_unauthenticated_returns_401(users_client: AsyncClient) -> None:
    response = await users_client.post(
        "/users/me/xp/spend",
        json={
            "action": "difficulty_unlock",
            "package_id": "sample-demo",
            "difficulty": "hard",
        },
    )

    assert response.status_code == 401


async def test_spend_insufficient_xp_returns_402(users_client: AsyncClient) -> None:
    _set_spend_economy_enabled(True)
    token = await _register_user_and_get_token(
        users_client,
        username="spend-insufficient",
        email="spend-insufficient@example.com",
    )
    await _set_user_xp(users_client, token, 0)

    response = await users_client.post(
        "/users/me/xp/spend",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "difficulty_unlock",
            "package_id": "sample-demo",
            "difficulty": "hard",
        },
    )

    assert response.status_code == 402


async def test_spend_invalid_package_returns_404(users_client: AsyncClient) -> None:
    _set_spend_economy_enabled(True)
    token = await _register_user_and_get_token(
        users_client,
        username="spend-invalid-package",
        email="spend-invalid-package@example.com",
    )
    await _set_user_xp(users_client, token, 500)

    response = await users_client.post(
        "/users/me/xp/spend",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "difficulty_unlock",
            "package_id": "nonexistent-pkg",
            "difficulty": "hard",
        },
    )

    assert response.status_code == 404


async def test_spend_difficulty_unlock_missing_difficulty_returns_422(
    users_client: AsyncClient,
) -> None:
    _set_spend_economy_enabled(True)
    token = await _register_user_and_get_token(
        users_client,
        username="spend-missing-difficulty",
        email="spend-missing-difficulty@example.com",
    )
    await _set_user_xp(users_client, token, 500)

    response = await users_client.post(
        "/users/me/xp/spend",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "difficulty_unlock",
            "package_id": "sample-demo",
        },
    )

    assert response.status_code == 422


async def test_spend_difficulty_unlock_success(users_client: AsyncClient) -> None:
    _set_spend_economy_enabled(True)
    token = await _register_user_and_get_token(
        users_client,
        username="spend-difficulty-success",
        email="spend-difficulty-success@example.com",
    )
    await _set_user_xp(users_client, token, 500)
    user_id = await _get_user_id(users_client, token)

    response = await users_client.post(
        "/users/me/xp/spend",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "difficulty_unlock",
            "package_id": "sample-demo",
            "difficulty": "hard",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["xp_remaining"] == 300

    with _db_session_from_override() as session:
        row = session.exec(
            select(SpendHistory).where(
                SpendHistory.user_id == user_id,
                SpendHistory.action == "difficulty_unlock",
                SpendHistory.package_id == "sample-demo",
                SpendHistory.difficulty == "hard",
                SpendHistory.success == True,  # noqa: E712
            )
        ).first()

    assert row is not None


async def test_spend_difficulty_unlock_idempotent_returns_409(
    users_client: AsyncClient,
) -> None:
    _set_spend_economy_enabled(True)
    token = await _register_user_and_get_token(
        users_client,
        username="spend-idempotent",
        email="spend-idempotent@example.com",
    )
    await _set_user_xp(users_client, token, 500)
    user_id = await _get_user_id(users_client, token)

    with _db_session_from_override() as session:
        session.add(
            SpendHistory(
                user_id=user_id,
                action="difficulty_unlock",
                package_id="sample-demo",
                difficulty="hard",
                cost=200,
                success=True,
            )
        )
        session.commit()

    pre_xp_response = await users_client.get(
        "/users/me/xp",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert pre_xp_response.status_code == 200
    assert pre_xp_response.json() == {"xp": 500}

    response = await users_client.post(
        "/users/me/xp/spend",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "difficulty_unlock",
            "package_id": "sample-demo",
            "difficulty": "hard",
        },
    )

    assert response.status_code == 409

    post_xp_response = await users_client.get(
        "/users/me/xp",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert post_xp_response.status_code == 200
    assert post_xp_response.json() == {"xp": 500}


async def test_spend_package_unlock_success(users_client: AsyncClient) -> None:
    _set_spend_economy_enabled(True)
    token = await _register_user_and_get_token(
        users_client,
        username="spend-package-success",
        email="spend-package-success@example.com",
    )
    await _set_user_xp(users_client, token, 500)

    response = await users_client.post(
        "/users/me/xp/spend",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "package_unlock",
            "package_id": "sample-demo",
        },
    )

    assert response.status_code == 200
    assert response.json()["xp_remaining"] == 250


async def test_get_unlocked_difficulties_empty(users_client: AsyncClient) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="unlocked-empty",
        email="unlocked-empty@example.com",
    )

    response = await users_client.get(
        "/users/me/unlocked-difficulties/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"hard": False, "expert": False}


async def test_get_unlocked_difficulties_after_spend(users_client: AsyncClient) -> None:
    token = await _register_user_and_get_token(
        users_client,
        username="unlocked-after-spend",
        email="unlocked-after-spend@example.com",
    )
    user_id = await _get_user_id(users_client, token)

    with _db_session_from_override() as session:
        session.add(
            SpendHistory(
                user_id=user_id,
                action="difficulty_unlock",
                package_id="sample-demo",
                difficulty="hard",
                cost=200,
                success=True,
            )
        )
        session.commit()

    response = await users_client.get(
        "/users/me/unlocked-difficulties/sample-demo",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"hard": True, "expert": False}
