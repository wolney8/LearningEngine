from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PackageRefreshRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refreshed_at: datetime
    previous_version: str
    new_version: str
    diff_summary: str
    content_hash: str


class RefreshMetadataDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 1
    packages: dict[str, PackageRefreshRecord] = Field(default_factory=dict)


class StalePackageInfo(BaseModel):
    id: str
    title: str
    last_updated_at: datetime
    days_since_update: int
    stale_after_days: int


class RefreshResult(BaseModel):
    package_id: str
    previous_version: str
    new_version: str
    diff_summary: str
    dry_run: bool
    refreshed_at: datetime | None = None
