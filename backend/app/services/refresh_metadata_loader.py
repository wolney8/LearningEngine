from __future__ import annotations

import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import yaml
from pydantic import ValidationError

from app.models.package import Package
from app.models.refresh import PackageAdminMetadataRecord, RefreshMetadataDocument

log = logging.getLogger(__name__)

REFRESH_METADATA_FILE = (
    Path(__file__).resolve().parent.parent.parent / "package-refresh-metadata.yaml"
)


def load_refresh_metadata(
    file: Path = REFRESH_METADATA_FILE,
) -> dict[str, PackageAdminMetadataRecord]:
    """Load refresh metadata. Return empty dict if file is missing or corrupt."""
    if not file.exists():
        return {}
    try:
        raw = yaml.safe_load(file.read_text(encoding="utf-8")) or {}
        doc = RefreshMetadataDocument.model_validate(raw)
        return doc.packages
    except (yaml.YAMLError, ValidationError, OSError) as exc:
        log.warning("Could not load refresh metadata from %s: %s", file, exc)
        return {}


def save_refresh_metadata(
    metadata: dict[str, PackageAdminMetadataRecord],
    file: Path = REFRESH_METADATA_FILE,
) -> None:
    """Atomically write refresh metadata to disk."""
    doc = RefreshMetadataDocument(packages=metadata)
    content = yaml.dump(
        doc.model_dump(mode="json", exclude_none=True),
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    file.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=file.parent,
        delete=False,
        suffix=".tmp",
    ) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)
    tmp_path.replace(file)


def ensure_package_metadata_records(
    packages: dict[str, Package],
    metadata: dict[str, PackageAdminMetadataRecord],
    packages_dir: Path,
    file: Path = REFRESH_METADATA_FILE,
) -> dict[str, PackageAdminMetadataRecord]:
    changed = False
    now = datetime.now(tz=timezone.utc)

    for package_id in packages:
        existing = metadata.get(package_id)

        if existing is None:
            yaml_file = packages_dir / f"{package_id}.yaml"
            try:
                mtime = yaml_file.stat().st_mtime
                inferred_added_at = datetime.fromtimestamp(mtime, tz=timezone.utc)
            except OSError:
                inferred_added_at = now

            metadata[package_id] = PackageAdminMetadataRecord(added_at=inferred_added_at)
            changed = True
            continue

        if existing.added_at is None:
            if existing.last_refreshed_at is not None:
                existing.added_at = existing.last_refreshed_at
            else:
                yaml_file = packages_dir / f"{package_id}.yaml"
                try:
                    mtime = yaml_file.stat().st_mtime
                    existing.added_at = datetime.fromtimestamp(mtime, tz=timezone.utc)
                except OSError:
                    existing.added_at = now
            changed = True

    if changed:
        save_refresh_metadata(metadata, file)

    return metadata
