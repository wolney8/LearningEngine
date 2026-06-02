from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MinCorrectForXPSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    easy: int = Field(ge=0)
    normal: int = Field(ge=0)
    hard: int = Field(ge=0)
    expert: int = Field(ge=0)


class XPSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lesson_base_xp_per_correct: int = Field(ge=0)
    base_xp_per_level: int = Field(default=500, ge=1)
    first_completion_bonus: int = Field(ge=0)
    attempt_multipliers: dict[int, float]
    hard_expert_exit_penalty: int = Field(ge=0)
    hard_expert_low_answer_penalty: int = Field(ge=0)
    min_correct_for_xp: MinCorrectForXPSettings

    @field_validator("attempt_multipliers", mode="before")
    @classmethod
    def normalise_attempt_multiplier_keys(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        converted: dict[int, Any] = {}
        for key, item in value.items():
            if isinstance(key, int):
                int_key = key
            elif isinstance(key, str) and key.isdigit():
                int_key = int(key)
            else:
                raise ValueError(
                    "attempt_multipliers keys must be integers 1, 2, or 3"
                )
            converted[int_key] = item

        return converted

    @field_validator("attempt_multipliers")
    @classmethod
    def validate_attempt_multiplier_values(
        cls, value: dict[int, float]
    ) -> dict[int, float]:
        invalid_values = [
            key for key, multiplier in value.items() if multiplier < 0
        ]
        if invalid_values:
            raise ValueError(
                "attempt_multipliers values must be non-negative"
            )
        return value

    @model_validator(mode="after")
    def validate_attempt_multiplier_keys(self) -> "XPSettings":
        expected_keys = {1, 2, 3}
        actual_keys = set(self.attempt_multipliers.keys())
        if actual_keys != expected_keys:
            raise ValueError(
                "attempt_multipliers must contain exactly keys 1, 2, and 3"
            )
        return self


class SecondsPerQuestionSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    easy: int = Field(ge=0)
    normal: int = Field(ge=0)
    hard: int = Field(ge=0)
    expert: int = Field(ge=0)


class DifficultyXPMultiplierSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    easy: float = Field(ge=0)
    normal: float = Field(ge=0)
    hard: float = Field(ge=0)
    expert: float = Field(ge=0)


class DifficultySettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seconds_per_question: SecondsPerQuestionSettings
    xp_multiplier: DifficultyXPMultiplierSettings


class ContentRefreshSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stale_after_days: int = Field(default=90, ge=1)


class AISettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["gemini"] = "gemini"
    model: str = Field(default="gemini-2.0-flash-exp", min_length=1)


class SpendActionCostSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generate_ai_course: int = Field(default=500, ge=0)
    refresh_stale_course: int = Field(default=300, ge=0)
    increase_difficulty_cap: int = Field(default=200, ge=0)
    unlock_hidden_package: int = Field(default=250, ge=0)


class SpendEconomySettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    allow_non_admin_ai_generation_spend: bool = False
    costs: SpendActionCostSettings = Field(default_factory=SpendActionCostSettings)


class CelebrationEffectsSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    confetti_on_pass: bool = True
    confetti_on_bonus_xp_gain: bool = True
    lightning_on_streak_milestones: bool = True
    respect_reduced_motion: bool = True


class GameSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=0)
    xp: XPSettings
    difficulty: DifficultySettings
    content_refresh: ContentRefreshSettings = Field(
        default_factory=ContentRefreshSettings
    )
    ai: AISettings = Field(default_factory=AISettings)
    spend_economy: SpendEconomySettings = Field(default_factory=SpendEconomySettings)
    celebration_effects: CelebrationEffectsSettings = Field(
        default_factory=CelebrationEffectsSettings
    )
