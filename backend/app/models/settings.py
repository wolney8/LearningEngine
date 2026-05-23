from __future__ import annotations

from typing import Any

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


class GameSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=0)
    xp: XPSettings
    difficulty: DifficultySettings
