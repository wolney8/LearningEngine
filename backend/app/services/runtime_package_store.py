from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.models.package import Package
from app.models.refresh import PackageAdminMetadataRecord
from app.models.runtime_package import ManagedPackageRecord
from app.services.overrides_loader import PackageOverride

logger = logging.getLogger(__name__)

DEFAULT_PACKAGE_STORAGE_BUDGET_BYTES = 100 * 1024 * 1024


class PackageStorageStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    used_bytes: int
    budget_bytes: int
    remaining_bytes: int
    percent_used: float
    limit_reached: bool


class RuntimePackageState(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    packages: dict[str, Package]
    overrides: dict[str, PackageOverride]
    refresh_metadata: dict[str, PackageAdminMetadataRecord]


def get_package_storage_budget_bytes() -> int:
    raw_value = os.getenv(
        "PACKAGE_STORAGE_BUDGET_BYTES",
        str(DEFAULT_PACKAGE_STORAGE_BUDGET_BYTES),
    ).strip()
    try:
        parsed = int(raw_value)
    except ValueError:
        return DEFAULT_PACKAGE_STORAGE_BUDGET_BYTES
    return max(parsed, 0)


def serialise_package_yaml(pkg: Package) -> str:
    return yaml.dump(
        pkg.model_dump(mode="json"),
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )


def _record_yaml_size_bytes(record: ManagedPackageRecord) -> int:
    return len(record.yaml_content.encode("utf-8"))


def get_runtime_package_storage_status(session: Session) -> PackageStorageStatus:
    records = session.exec(select(ManagedPackageRecord)).all()
    used_bytes = sum(_record_yaml_size_bytes(record) for record in records)
    budget_bytes = get_package_storage_budget_bytes()
    remaining_bytes = max(budget_bytes - used_bytes, 0)
    percent_used = 0.0
    if budget_bytes > 0:
        percent_used = min((used_bytes / budget_bytes) * 100.0, 100.0)
    return PackageStorageStatus(
        used_bytes=used_bytes,
        budget_bytes=budget_bytes,
        remaining_bytes=remaining_bytes,
        percent_used=percent_used,
        limit_reached=budget_bytes > 0 and used_bytes >= budget_bytes,
    )


def enforce_runtime_package_storage_budget(
    session: Session,
    *,
    new_yaml_content: str,
    package_id: str,
) -> None:
    budget_bytes = get_package_storage_budget_bytes()
    if budget_bytes <= 0:
        return

    existing = session.exec(
        select(ManagedPackageRecord).where(ManagedPackageRecord.package_id == package_id)
    ).first()
    existing_size = _record_yaml_size_bytes(existing) if existing is not None else 0
    current_status = get_runtime_package_storage_status(session)
    projected_used = current_status.used_bytes - existing_size + len(
        new_yaml_content.encode("utf-8")
    )
    if projected_used > budget_bytes:
        raise ValueError(
            "Runtime package YAML storage limit reached. Delete packages or increase "
            "PACKAGE_STORAGE_BUDGET_BYTES before saving more package content."
        )


def load_runtime_package_state(
    seed_packages: dict[str, Package],
    session: Session,
) -> RuntimePackageState:
    packages = dict(seed_packages)
    overrides: dict[str, PackageOverride] = {}
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = {}

    records = session.exec(
        select(ManagedPackageRecord).order_by(ManagedPackageRecord.package_id)
    ).all()
    for record in records:
        if record.deleted:
            packages.pop(record.package_id, None)
            overrides.pop(record.package_id, None)
            refresh_metadata.pop(record.package_id, None)
            continue

        if record.yaml_content.strip():
            try:
                raw: Any = yaml.safe_load(record.yaml_content)
                pkg = Package.model_validate(raw)
            except Exception as exc:  # pragma: no cover - defensive log path
                logger.warning(
                    "Skipping managed package %s due to invalid YAML payload: %s",
                    record.package_id,
                    exc,
                )
                continue
            packages[pkg.id] = pkg

        overrides[record.package_id] = PackageOverride(
            availability=record.availability,
            enabled=None,
            xp_threshold=record.xp_threshold,
        )
        refresh_metadata[record.package_id] = PackageAdminMetadataRecord(
            added_at=record.added_at,
            last_refreshed_at=record.last_refreshed_at,
            refreshed_at=record.last_refreshed_at,
            previous_version=record.previous_version,
            new_version=record.new_version,
            diff_summary=record.diff_summary,
            content_hash=record.content_hash,
        )

    return RuntimePackageState(
        packages=packages,
        overrides=overrides,
        refresh_metadata=refresh_metadata,
    )


def save_managed_package_record(
    session: Session,
    *,
    package_id: str,
    yaml_content: str,
    availability: str,
    xp_threshold: int | None,
    deleted: bool,
    added_at: datetime | None = None,
    last_refreshed_at: datetime | None = None,
    previous_version: str | None = None,
    new_version: str | None = None,
    diff_summary: str | None = None,
    content_hash: str | None = None,
) -> ManagedPackageRecord:
    now = datetime.now(timezone.utc)
    record = session.exec(
        select(ManagedPackageRecord).where(ManagedPackageRecord.package_id == package_id)
    ).first()

    if record is None:
        record = ManagedPackageRecord(
            package_id=package_id,
            yaml_content=yaml_content,
            availability=availability,
            xp_threshold=xp_threshold,
            deleted=deleted,
            added_at=added_at or now,
            last_refreshed_at=last_refreshed_at,
            previous_version=previous_version,
            new_version=new_version,
            diff_summary=diff_summary,
            content_hash=content_hash,
            updated_at=now,
        )
    else:
        record.yaml_content = yaml_content
        record.availability = availability
        record.xp_threshold = xp_threshold
        record.deleted = deleted
        if added_at is not None:
            record.added_at = added_at
        if last_refreshed_at is not None or deleted:
            record.last_refreshed_at = last_refreshed_at
        record.previous_version = previous_version
        record.new_version = new_version
        record.diff_summary = diff_summary
        record.content_hash = content_hash
        record.updated_at = now

    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def compute_package_content_hash(yaml_content: str) -> str:
    return hashlib.sha256(yaml_content.encode("utf-8")).hexdigest()
