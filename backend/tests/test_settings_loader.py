from pathlib import Path

import pytest

from app.services.settings_loader import load_settings

_VALID_YAML = """\
version: 1
xp:
  lesson_base_xp_per_correct: 10
  base_xp_per_level: 500
  first_completion_bonus: 20
  attempt_multipliers:
    \"1\": 1.0
    \"2\": 0.5
    \"3\": 0.25
  hard_expert_exit_penalty: 50
  hard_expert_low_answer_penalty: 50
  min_correct_for_xp:
    easy: 2
    normal: 2
    hard: 0
    expert: 0
difficulty:
  seconds_per_question:
    easy: 90
    normal: 45
    hard: 20
    expert: 10
  xp_multiplier:
    easy: 0.5
    normal: 1.0
    hard: 1.5
    expert: 2.0
spend_economy:
  enabled: true
  allow_non_admin_ai_generation_spend: true
  costs:
    generate_ai_course: 700
    refresh_stale_course: 350
    increase_difficulty_cap: 125
    unlock_hidden_package: 175
"""


def test_load_settings_reads_valid_yaml(tmp_path: Path) -> None:
    settings_path = tmp_path / "settings.yaml"
    settings_path.write_text(_VALID_YAML, encoding="utf-8")

    settings = load_settings(settings_path)

    assert settings.version == 1
    assert settings.xp.first_completion_bonus == 20
    assert settings.xp.base_xp_per_level == 500
    assert settings.difficulty.xp_multiplier.hard == 1.5
    assert settings.ai.provider == "gemini"
    assert settings.ai.model == "gemini-2.0-flash-exp"
    assert settings.spend_economy.enabled is True
    assert settings.spend_economy.allow_non_admin_ai_generation_spend is True
    assert settings.spend_economy.costs.generate_ai_course == 700


def test_load_settings_raises_when_file_missing(tmp_path: Path) -> None:
    missing = tmp_path / "missing-settings.yaml"

    with pytest.raises(FileNotFoundError):
        load_settings(missing)


def test_load_settings_raises_value_error_for_invalid_yaml(tmp_path: Path) -> None:
    settings_path = tmp_path / "settings.yaml"
    settings_path.write_text("version: [", encoding="utf-8")

    with pytest.raises(ValueError, match="Failed to parse settings YAML"):
        load_settings(settings_path)


def test_load_settings_raises_value_error_for_schema_invalid_yaml(
    tmp_path: Path,
) -> None:
    settings_path = tmp_path / "settings.yaml"
    settings_path.write_text(
        _VALID_YAML.replace('    \"3\": 0.25\n', ""),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Settings validation failed"):
        load_settings(settings_path)
