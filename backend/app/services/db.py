from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from app.models.user import User
from app.services.security import hash_password

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

        if "pending_bonus_xp" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "user" '
                "ADD COLUMN pending_bonus_xp INTEGER NOT NULL DEFAULT 0"
            )

        if "pending_bonus_reason" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "user" ADD COLUMN pending_bonus_reason TEXT'
            )

        if "last_practised_date" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "user" ADD COLUMN last_practised_date DATE'
            )


def _ensure_sqlite_user_library_schema_compatibility() -> None:
    """Backfill newly-added UserLibraryItem columns for pre-existing SQLite DBs."""
    with engine.begin() as connection:
        table_info = connection.exec_driver_sql(
            'PRAGMA table_info("user_library_item")'
        ).all()
        if not table_info:
            return

        existing_columns = {row[1] for row in table_info}

        if "status" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "user_library_item" '
                "ADD COLUMN status TEXT NOT NULL DEFAULT 'selected'"
            )

        if "created_at" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "user_library_item" '
                "ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
            )

        if "updated_at" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "user_library_item" '
                "ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
            )

        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "uq_user_library_items_user_package "
            "ON user_library_item (user_id, package_id)"
        )


def _ensure_sqlite_user_test_result_schema_compatibility() -> None:
    """Backfill newly-added UserTestResult columns for legacy SQLite DBs."""
    with engine.begin() as connection:
        table_info = connection.exec_driver_sql(
            'PRAGMA table_info("usertestresult")'
        ).all()
        if not table_info:
            return

        existing_columns = {row[1] for row in table_info}

        if "attempt_count" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "usertestresult" '
                "ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1"
            )

        if "first_completed_at" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "usertestresult" '
                "ADD COLUMN first_completed_at TIMESTAMP"
            )

        if "best_xp_earned" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "usertestresult" '
                "ADD COLUMN best_xp_earned INTEGER NOT NULL DEFAULT 0"
            )

        if "difficulty_results_json" not in existing_columns:
            connection.exec_driver_sql(
                'ALTER TABLE "usertestresult" '
                "ADD COLUMN difficulty_results_json TEXT"
            )


def _ensure_sqlite_spend_history_schema_compatibility(session: Session) -> None:
    """Add missing columns to spend_history for existing DBs.

    SQLite does not support ALTER TABLE DROP COLUMN or multi-column ALTER,
    so we only add missing columns. New installs get the full schema via
    SQLModel.metadata.create_all().
    """
    result = session.exec(text("PRAGMA table_info('spend_history')")).all()
    existing_cols = {row[1] for row in result}

    if not existing_cols:
        # Table does not exist yet — create_all will handle it.
        return

    if "difficulty" not in existing_cols:
        session.exec(text("ALTER TABLE spend_history ADD COLUMN difficulty TEXT"))

    if "cost" not in existing_cols:
        session.exec(
            text(
                "ALTER TABLE spend_history "
                "ADD COLUMN cost INTEGER NOT NULL DEFAULT 0"
            )
        )

    if "success" not in existing_cols:
        session.exec(
            text(
                "ALTER TABLE spend_history "
                "ADD COLUMN success INTEGER NOT NULL DEFAULT 0"
            )
        )


def init_db() -> None:
    # Ensure metadata includes user-related tables before creating schema.
    from app.models.user import (  # noqa: F401
        AdminAuditLog,
        SpendHistory,
        User,
        UserLibraryItem,
        UserTestResult,
        UserXPSpendHistory,
    )

    if DATABASE_URL.startswith("sqlite"):
        sqlite_path = DATABASE_URL.replace("sqlite:///", "", 1)
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        _ensure_sqlite_user_schema_compatibility()
        _ensure_sqlite_user_library_schema_compatibility()
        _ensure_sqlite_user_test_result_schema_compatibility()
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            _ensure_sqlite_spend_history_schema_compatibility(session)
            session.commit()
    else:
        SQLModel.metadata.create_all(engine)
    bootstrap_initial_admin_user()


def bootstrap_initial_admin_user() -> None:
    """Create or elevate an admin user from env vars if no admin exists.

    Expected env vars:
    - LLE_BOOTSTRAP_ADMIN_USERNAME
    - LLE_BOOTSTRAP_ADMIN_EMAIL
    - LLE_BOOTSTRAP_ADMIN_PASSWORD
    """

    with Session(engine) as session:
        existing_admin = session.exec(select(User).where(User.role == "admin")).first()
        if existing_admin is not None:
            return

        username = os.getenv("LLE_BOOTSTRAP_ADMIN_USERNAME", "").strip().lower()
        email = os.getenv("LLE_BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
        password = os.getenv("LLE_BOOTSTRAP_ADMIN_PASSWORD", "")

        if not username or not email or not password:
            return

        existing_user = session.exec(
            select(User).where((User.username == username) | (User.email == email))
        ).first()

        if existing_user is None:
            session.add(
                User(
                    username=username,
                    email=email,
                    hashed_password=hash_password(password),
                    role="admin",
                )
            )
            session.commit()
            return

        existing_user.role = "admin"
        existing_user.hashed_password = hash_password(password)
        session.add(existing_user)
        session.commit()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
