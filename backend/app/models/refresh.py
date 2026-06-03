from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PackageAdminMetadataRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    added_at: datetime | None = None
    last_refreshed_at: datetime | None = None
    refreshed_at: datetime | None = None
    previous_version: str | None = None
    new_version: str | None = None
    diff_summary: str | None = None
    content_hash: str | None = None

    @model_validator(mode="after")
    def derive_refresh_timestamps(self) -> "PackageAdminMetadataRecord":
        if self.last_refreshed_at is None and self.refreshed_at is not None:
            self.last_refreshed_at = self.refreshed_at
        if self.refreshed_at is None and self.last_refreshed_at is not None:
            self.refreshed_at = self.last_refreshed_at
        return self


class RefreshMetadataDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 2
    packages: dict[str, PackageAdminMetadataRecord] = Field(default_factory=dict)


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
