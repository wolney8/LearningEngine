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
    assert settings.celebration_effects.enabled is False
    assert settings.celebration_effects.confetti_on_pass is True
    assert settings.celebration_effects.confetti_on_bonus_xp_gain is True
    assert settings.celebration_effects.lightning_on_streak_milestones is True
    assert settings.celebration_effects.respect_reduced_motion is True


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


def test_game_settings_ai_defaults() -> None:
    settings = GameSettings.model_validate(_valid_settings_dict())

    assert settings.ai.provider == "gemini"
    assert settings.ai.model == "gemini-2.0-flash-exp"


def test_game_settings_ai_rejects_empty_model() -> None:
    payload = _valid_settings_dict()
    payload["ai"] = {"provider": "gemini", "model": ""}

    with pytest.raises(ValidationError):
        GameSettings.model_validate(payload)


def test_game_settings_ai_accepts_supported_provider_variants() -> None:
    payload = _valid_settings_dict()
    payload["ai"] = {"provider": "openai", "model": "gpt-4o-mini"}

    settings = GameSettings.model_validate(payload)

    assert settings.ai.provider == "openai"
    assert settings.ai.model == "gpt-4o-mini"


def test_game_settings_spend_economy_defaults() -> None:
    settings = GameSettings.model_validate(_valid_settings_dict())

    assert settings.spend_economy.enabled is False
    assert settings.spend_economy.allow_non_admin_ai_generation_spend is False
    assert settings.spend_economy.costs.generate_ai_course == 500


def test_game_settings_spend_economy_custom_values() -> None:
    payload = _valid_settings_dict()
    payload["spend_economy"] = {
        "enabled": True,
        "allow_non_admin_ai_generation_spend": True,
        "costs": {
            "generate_ai_course": 900,
            "refresh_stale_course": 450,
            "increase_difficulty_cap": 150,
            "unlock_hidden_package": 275,
        },
    }

    settings = GameSettings.model_validate(payload)
    assert settings.spend_economy.enabled is True
    assert settings.spend_economy.allow_non_admin_ai_generation_spend is True
    assert settings.spend_economy.costs.refresh_stale_course == 450


def test_game_settings_spend_economy_rejects_negative_cost() -> None:
    payload = _valid_settings_dict()
    payload["spend_economy"] = {
        "enabled": True,
        "allow_non_admin_ai_generation_spend": False,
        "costs": {
            "generate_ai_course": -1,
            "refresh_stale_course": 300,
            "increase_difficulty_cap": 200,
            "unlock_hidden_package": 250,
        },
    }

    with pytest.raises(ValidationError):
        GameSettings.model_validate(payload)


def test_game_settings_celebration_effects_accepts_override_values() -> None:
    payload = _valid_settings_dict()
    payload["celebration_effects"] = {
        "enabled": True,
        "confetti_on_pass": False,
        "confetti_on_bonus_xp_gain": True,
        "lightning_on_streak_milestones": False,
        "respect_reduced_motion": True,
    }

    settings = GameSettings.model_validate(payload)

    assert settings.celebration_effects.enabled is True
    assert settings.celebration_effects.confetti_on_pass is False
    assert settings.celebration_effects.confetti_on_bonus_xp_gain is True
    assert settings.celebration_effects.lightning_on_streak_milestones is False
    assert settings.celebration_effects.respect_reduced_motion is True


def test_game_settings_celebration_effects_rejects_unknown_fields() -> None:
    payload = _valid_settings_dict()
    payload["celebration_effects"] = {
        "enabled": True,
        "confetti_on_pass": True,
        "confetti_on_bonus_xp_gain": True,
        "lightning_on_streak_milestones": True,
        "respect_reduced_motion": True,
        "sparkle_mode": True,
    }

    with pytest.raises(ValidationError):
        GameSettings.model_validate(payload)
