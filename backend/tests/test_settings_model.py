import pytest
from pydantic import ValidationError

from app.models.settings import GameSettings


def _valid_settings_dict() -> dict:
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
    }


def test_game_settings_model_parses_valid_payload() -> None:
    settings = GameSettings.model_validate(_valid_settings_dict())

    assert settings.version == 1
    assert settings.xp.attempt_multipliers == {1: 1.0, 2: 0.5, 3: 0.25}
    assert settings.xp.base_xp_per_level == 500
    assert settings.difficulty.seconds_per_question.expert == 10


def test_game_settings_rejects_unknown_fields() -> None:
    payload = _valid_settings_dict()
    payload["unknown_field"] = True

    with pytest.raises(ValidationError):
        GameSettings.model_validate(payload)


def test_game_settings_rejects_missing_or_invalid_attempt_multiplier_keys() -> None:
    missing_key_payload = _valid_settings_dict()
    missing_key_payload["xp"]["attempt_multipliers"] = {"1": 1.0, "2": 0.5}

    with pytest.raises(ValidationError):
        GameSettings.model_validate(missing_key_payload)

    invalid_key_payload = _valid_settings_dict()
    invalid_key_payload["xp"]["attempt_multipliers"] = {
        "1": 1.0,
        "2": 0.5,
        "x": 0.25,
    }

    with pytest.raises(ValidationError):
        GameSettings.model_validate(invalid_key_payload)


def test_game_settings_rejects_negative_values() -> None:
    negative_bonus_payload = _valid_settings_dict()
    negative_bonus_payload["xp"]["first_completion_bonus"] = -1

    with pytest.raises(ValidationError):
        GameSettings.model_validate(negative_bonus_payload)

    negative_multiplier_payload = _valid_settings_dict()
    negative_multiplier_payload["xp"]["attempt_multipliers"] = {
        "1": 1.0,
        "2": -0.5,
        "3": 0.25,
    }

    with pytest.raises(ValidationError):
        GameSettings.model_validate(negative_multiplier_payload)


def test_game_settings_rejects_non_positive_base_xp_per_level() -> None:
    payload = _valid_settings_dict()
    payload["xp"]["base_xp_per_level"] = 0

    with pytest.raises(ValidationError):
        GameSettings.model_validate(payload)


def test_game_settings_content_refresh_defaults() -> None:
    settings = GameSettings.model_validate(_valid_settings_dict())

    assert settings.content_refresh.stale_after_days == 90


def test_game_settings_content_refresh_custom_value() -> None:
    payload = _valid_settings_dict()
    payload["content_refresh"] = {"stale_after_days": 30}

    settings = GameSettings.model_validate(payload)
    assert settings.content_refresh.stale_after_days == 30


def test_game_settings_content_refresh_rejects_zero() -> None:
    payload = _valid_settings_dict()
    payload["content_refresh"] = {"stale_after_days": 0}

    with pytest.raises(ValidationError):
        GameSettings.model_validate(payload)
