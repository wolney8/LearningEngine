import logging
import os
from pathlib import Path

import yaml
from pydantic import ValidationError

from app.models.package import Package

logger = logging.getLogger(__name__)

_DEFAULT_PACKAGES_DIR = Path(__file__).resolve().parents[3] / "packages"
PACKAGES_DIR = Path(os.getenv("PACKAGES_DIR", str(_DEFAULT_PACKAGES_DIR)))


def load_packages(packages_dir: Path = PACKAGES_DIR) -> dict[str, Package]:
    """Scan packages_dir for *.yaml files and validate each via Pydantic."""
    cache: dict[str, Package] = {}

    if not packages_dir.is_dir():
        logger.warning(
            "PACKAGES_DIR %s does not exist — starting with empty cache", packages_dir
        )
        return cache

    for yaml_file in sorted(packages_dir.glob("*.yaml")):
        try:
            data = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
            pkg = Package.model_validate(data)
            cache[pkg.id] = pkg
            logger.info("Loaded package %r from %s", pkg.id, yaml_file.name)
        except yaml.YAMLError as exc:
            logger.warning("Skipping %s — YAML parse error: %s", yaml_file.name, exc)
        except ValidationError as exc:
            logger.warning(
                "Skipping %s — schema validation error: %s", yaml_file.name, exc
            )

    logger.info("Package cache ready: %d package(s) loaded", len(cache))
    return cache
