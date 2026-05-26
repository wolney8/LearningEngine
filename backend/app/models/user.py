from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, min_length=3, max_length=50)
    email: str = Field(index=True, unique=True, min_length=5, max_length=320)
    hashed_password: str
    role: str = Field(default="student", min_length=3, max_length=20)
    xp: int = Field(default=0, ge=0)
    streak_count: int = Field(default=0, ge=0)
    last_practised_date: date | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserTestResult(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "package_id",
            name="uq_user_test_results_user_package",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    package_id: str = Field(index=True, min_length=1, max_length=200)
    latest_weighted_score: float = Field(ge=0.0, le=1.0)
    completed: bool = Field(default=False)
    attempt_count: int = Field(default=1, ge=1)
    first_completed_at: datetime | None = Field(default=None)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserLibraryItem(SQLModel, table=True):
    __tablename__ = "user_library_item"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "package_id",
            name="uq_user_library_items_user_package",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    package_id: str = Field(index=True, min_length=1, max_length=200)
    status: str = Field(default="selected", min_length=1, max_length=30)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
