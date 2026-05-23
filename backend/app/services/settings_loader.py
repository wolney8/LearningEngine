import logging
import os
from pathlib import Path

import yaml
from pydantic import ValidationError

from app.models.settings import GameSettings

logger = logging.getLogger(__name__)

_DEFAULT_SETTINGS_FILE = Path(__file__).resolve().parents[2] / "settings.yaml"
SETTINGS_FILE = Path(os.getenv("SETTINGS_FILE", str(_DEFAULT_SETTINGS_FILE)))


def load_settings(settings_file: Path = SETTINGS_FILE) -> GameSettings:
    """Load and validate game settings YAML from disk."""
    if not settings_file.is_file():
        raise FileNotFoundError(
            f"Settings file not found: {settings_file}. "
            "Set SETTINGS_FILE to override the default path."
        )

    try:
        raw_data = yaml.safe_load(settings_file.read_text(encoding="utf-8"))
        settings = GameSettings.model_validate(raw_data)
    except yaml.YAMLError as exc:
        raise ValueError(
            f"Failed to parse settings YAML at {settings_file}: {exc}"
        ) from exc
    except ValidationError as exc:
        raise ValueError(
            f"Settings validation failed for {settings_file}: {exc}"
        ) from exc

    logger.info("Loaded game settings from %s", settings_file)
    return settings
