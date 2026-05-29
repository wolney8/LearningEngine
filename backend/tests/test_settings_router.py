from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.settings import GameSettings
from app.routers.settings import get_settings


def _settings_payload(first_completion_bonus: int = 20) -> dict:
    return {
        "version": 1,
        "xp": {
            "lesson_base_xp_per_correct": 10,
            "base_xp_per_level": 500,
            "first_completion_bonus": first_completion_bonus,
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
    }


async def test_get_settings_returns_expected_shape() -> None:
    app.dependency_overrides[get_settings] = lambda: GameSettings.model_validate(
        _settings_payload()
    )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/settings")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["version"] == 1
    assert body["xp"]["first_completion_bonus"] == 20
    assert body["xp"]["base_xp_per_level"] == 500
    assert body["xp"]["attempt_multipliers"]["2"] == 0.5
    assert body["difficulty"]["seconds_per_question"]["expert"] == 10


async def test_get_settings_dependency_override_path() -> None:
    app.dependency_overrides[get_settings] = lambda: GameSettings.model_validate(
        _settings_payload(first_completion_bonus=77)
    )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/settings")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["xp"]["first_completion_bonus"] == 77
