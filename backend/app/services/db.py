from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from sqlmodel import Session, SQLModel, create_engine

_DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "lle.db"
_DEFAULT_DATABASE_URL = f"sqlite:///{_DEFAULT_DB_PATH}"

DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL)

_connect_args = (
    {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
engine = create_engine(DATABASE_URL, connect_args=_connect_args)


def _ensure_sqlite_user_schema_compatibility() -> None:
    """Backfill newly-added User columns for pre-existing SQLite databases."""
    with engine.begin() as connection:
        table_info = connection.exec_driver_sql('PRAGMA table_info("user")').all()
        if not table_info:
            return

        existing_columns = {row[1] for row in table_info}

        if "streak_count" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "user" '
                "ADD COLUMN streak_count INTEGER NOT NULL DEFAULT 0"
            )

        if "last_practised_date" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "user" ADD COLUMN last_practised_date DATE'
            )


def init_db() -> None:
    # Ensure metadata includes the User table before creating schema.
    from app.models.user import User, UserTestResult  # noqa: F401

    if DATABASE_URL.startswith("sqlite"):
        sqlite_path = DATABASE_URL.replace("sqlite:///", "", 1)
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        _ensure_sqlite_user_schema_compatibility()
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
