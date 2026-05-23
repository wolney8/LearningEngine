from __future__ import annotations

import logging
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

_DEFAULT_OVERRIDES_FILE = Path(__file__).resolve().parents[2] / "package-overrides.yaml"
OVERRIDES_FILE = Path(os.getenv("PACKAGE_OVERRIDES_FILE", str(_DEFAULT_OVERRIDES_FILE)))


class PackageOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    xp_threshold: int | None = Field(default=None, ge=0)


class PackageOverridesDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 1
    packages: dict[str, PackageOverride] = Field(default_factory=dict)


def load_package_overrides(
    overrides_file: Path = OVERRIDES_FILE,
) -> dict[str, PackageOverride]:
    """Load package overrides from sidecar YAML.

    Missing file returns empty overrides.
    """
    if not overrides_file.exists():
        logger.info(
            "Overrides file %s not found; using empty overrides", overrides_file
        )
        return {}

    try:
        raw_data = yaml.safe_load(overrides_file.read_text(encoding="utf-8")) or {}
        document = PackageOverridesDocument.model_validate(raw_data)
    except yaml.YAMLError as exc:
        raise ValueError(
            f"Failed to parse overrides YAML at {overrides_file}: {exc}"
        ) from exc
    except ValidationError as exc:
        raise ValueError(
            f"Overrides validation failed for {overrides_file}: {exc}"
        ) from exc

    logger.info(
        "Loaded %d package override(s) from %s",
        len(document.packages),
        overrides_file,
    )
    return document.packages


def save_package_overrides(
    overrides: dict[str, PackageOverride],
    overrides_file: Path = OVERRIDES_FILE,
) -> None:
    """Persist overrides atomically to avoid partial writes."""
    overrides_file.parent.mkdir(parents=True, exist_ok=True)
    document = PackageOverridesDocument(version=1, packages=overrides)

    with NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=overrides_file.parent, delete=False
    ) as temp_file:
        temp_path = Path(temp_file.name)
        yaml.safe_dump(document.model_dump(mode="json"), temp_file, sort_keys=False)

    temp_path.replace(overrides_file)
    logger.info("Saved %d package override(s) to %s", len(overrides), overrides_file)
