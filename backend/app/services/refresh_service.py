from __future__ import annotations

import hashlib
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from app.models.package import Package
from app.models.refresh import PackageAdminMetadataRecord, StalePackageInfo
from app.services.refresh_metadata_loader import save_refresh_metadata

log = logging.getLogger(__name__)

PACKAGES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "packages"


def _bump_patch_version(version: str) -> str:
    """Increment the patch component of a semver string. Falls back to appending .1."""
    parts = version.split(".")
    if len(parts) == 3:
        try:
            parts[2] = str(int(parts[2]) + 1)
            return ".".join(parts)
        except ValueError:
            pass
    return version + ".1"


def get_last_updated_at(
    package_id: str,
    refresh_metadata: dict[str, PackageAdminMetadataRecord],
    packages_dir: Path,
) -> datetime:
    """Return the most recent known update time for a package."""
    if package_id in refresh_metadata:
        record = refresh_metadata[package_id]
        if record.last_refreshed_at is not None:
            return record.last_refreshed_at
        if record.added_at is not None:
            return record.added_at
    yaml_file = packages_dir / f"{package_id}.yaml"
    try:
        mtime = os.stat(yaml_file).st_mtime
        return datetime.fromtimestamp(mtime, tz=timezone.utc)
    except FileNotFoundError:
        log.warning(
            "No YAML file found for package %s; treating as always stale.", package_id
        )
        return datetime.min.replace(tzinfo=timezone.utc)


def detect_stale_packages(
    packages: dict[str, Package],
    refresh_metadata: dict[str, PackageAdminMetadataRecord],
    stale_after_days: int,
    packages_dir: Path,
) -> list[StalePackageInfo]:
    """Return packages whose last-update date exceeds stale_after_days."""
    now = datetime.now(tz=timezone.utc)
    results: list[StalePackageInfo] = []
    for pkg in packages.values():
        last_updated = get_last_updated_at(pkg.id, refresh_metadata, packages_dir)
        days_since = (now - last_updated).days
        if days_since >= stale_after_days:
            results.append(
                StalePackageInfo(
                    id=pkg.id,
                    title=pkg.title,
                    last_updated_at=last_updated,
                    days_since_update=days_since,
                    stale_after_days=stale_after_days,
                )
            )
    results.sort(key=lambda item: item.days_since_update, reverse=True)
    return results


def compute_diff_summary(old_pkg: Package, new_pkg: Package) -> str:
    """Return a summary of changes between old and new package versions."""
    changes: list[str] = []

    old_page_count = len(old_pkg.pages)
    new_page_count = len(new_pkg.pages)
    if old_page_count != new_page_count:
        changes.append(f"page count changed {old_page_count} -> {new_page_count}")

    old_q_count = len(old_pkg.questions)
    new_q_count = len(new_pkg.questions)
    if old_q_count != new_q_count:
        changes.append(f"question count changed {old_q_count} -> {new_q_count}")

    changed_pages = 0
    for old_page, new_page in zip(old_pkg.pages, new_pkg.pages):
        old_hash = hashlib.md5(old_page.content.encode()).hexdigest()
        new_hash = hashlib.md5(new_page.content.encode()).hexdigest()
        if old_hash != new_hash:
            changed_pages += 1
    if changed_pages:
        changes.append(f"{changed_pages} page(s) updated")

    changed_questions = 0
    for old_question, new_question in zip(old_pkg.questions, new_pkg.questions):
        old_hash = hashlib.md5(old_question.text.encode()).hexdigest()
        new_hash = hashlib.md5(new_question.text.encode()).hexdigest()
        if old_hash != new_hash:
            changed_questions += 1
    if changed_questions:
        changes.append(f"{changed_questions} question(s) updated")

    return "; ".join(changes) if changes else "no structural changes detected"


def write_refreshed_package(
    package_id: str,
    new_yaml_str: str,
    packages_dir: Path,
    old_pkg: Package,
    refresh_metadata: dict[str, PackageAdminMetadataRecord],
    refresh_metadata_file: Path,
    now: datetime,
) -> tuple[Package, PackageAdminMetadataRecord]:
    """
    Validate, patch, back up, and atomically write the refreshed YAML package.

    Raises ValueError on YAML/schema errors (caller converts to HTTPException).
    """
    try:
        raw: Any = yaml.safe_load(new_yaml_str)
    except yaml.YAMLError as exc:
        raise ValueError(f"YAML parse error: {exc}") from exc

    try:
        new_pkg = Package.model_validate(raw)
    except ValidationError as exc:
        raise ValueError(f"Schema validation failed: {exc}") from exc

    new_pkg = new_pkg.model_copy(
        update={"id": old_pkg.id, "version": _bump_patch_version(old_pkg.version)}
    )

    final_yaml = yaml.dump(
        new_pkg.model_dump(mode="json"),
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    yaml_bytes = final_yaml.encode("utf-8")
    content_hash = hashlib.sha256(yaml_bytes).hexdigest()

    target = packages_dir / f"{package_id}.yaml"

    if target.exists():
        target.rename(packages_dir / f"{package_id}.yaml.bak")

    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=packages_dir,
        delete=False,
        suffix=".tmp",
    ) as tmp:
        tmp.write(yaml_bytes)
        tmp_path = Path(tmp.name)
    tmp_path.replace(target)

    diff = compute_diff_summary(old_pkg, new_pkg)
    existing_record = refresh_metadata.get(package_id)
    record = PackageAdminMetadataRecord(
        added_at=existing_record.added_at if existing_record else None,
        last_refreshed_at=now,
        refreshed_at=now,
        previous_version=old_pkg.version,
        new_version=new_pkg.version,
        diff_summary=diff,
        content_hash=content_hash,
    )
    refresh_metadata[package_id] = record
    save_refresh_metadata(refresh_metadata, refresh_metadata_file)

    return new_pkg, record
