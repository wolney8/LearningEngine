import logging
import os
from pathlib import Path

import yaml
from pydantic import ValidationError

from app.models.package import Package

logger = logging.getLogger(__name__)

_DEFAULT_PACKAGES_DIR = Path(__file__).resolve().parents[3] / "packages"
PACKAGES_DIR = Path(os.getenv("PACKAGES_DIR", str(_DEFAULT_PACKAGES_DIR)))


def resolve_packages_dir(configured_dir: Path = PACKAGES_DIR) -> Path:
    env_value = os.getenv("PACKAGES_DIR", "").strip()
    candidates: list[Path] = []

    if env_value:
        candidates.append(Path(env_value))
    else:
        candidates.extend(
            [
                configured_dir,
                Path(__file__).resolve().parents[2] / "packages",
                Path(__file__).resolve().parents[3] / "packages",
                Path("/var/task/packages"),
                Path("/var/task/../packages"),
            ]
        )

    seen: set[Path] = set()
    for candidate in candidates:
        resolved_candidate = candidate.resolve(strict=False)
        if resolved_candidate in seen:
            continue
        seen.add(resolved_candidate)
        if candidate.is_dir():
            logger.info("Using PACKAGES_DIR %s", candidate)
            return candidate

    logger.warning(
        "No package directory found. Checked: %s",
        ", ".join(str(candidate) for candidate in candidates),
    )
    return configured_dir


def load_packages(packages_dir: Path = PACKAGES_DIR) -> dict[str, Package]:
    """Scan packages_dir for *.yaml files and validate each via Pydantic."""
    cache: dict[str, Package] = {}
    resolved_dir = resolve_packages_dir(packages_dir)

    if not resolved_dir.is_dir():
        logger.warning(
            "PACKAGES_DIR %s does not exist — starting with empty cache", resolved_dir
        )
        return cache

    for yaml_file in sorted(resolved_dir.glob("*.yaml")):
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

    logger.info(
        "Package cache ready: %d package(s) loaded from %s",
        len(cache),
        resolved_dir,
    )
    return cache
