from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class ManagedPackageRecord(SQLModel, table=True):
    __tablename__ = "managed_package"

    id: int | None = Field(default=None, primary_key=True)
    package_id: str = Field(index=True, unique=True, min_length=1, max_length=200)
    yaml_content: str = Field(default="")
    availability: str = Field(default="available", min_length=1, max_length=20)
    xp_threshold: int | None = Field(default=None, ge=0)
    deleted: bool = Field(default=False)
    added_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_refreshed_at: datetime | None = Field(default=None)
    previous_version: str | None = Field(default=None, max_length=50)
    new_version: str | None = Field(default=None, max_length=50)
    diff_summary: str | None = Field(default=None, max_length=4000)
    content_hash: str | None = Field(default=None, max_length=128)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
