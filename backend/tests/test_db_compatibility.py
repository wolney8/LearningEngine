from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlmodel import create_engine

from app.services import db


def _read_user_table_info(db_path: Path) -> list[tuple]:
    with sqlite3.connect(db_path) as connection:
        return connection.execute('PRAGMA table_info("user")').fetchall()


def _read_table_info(db_path: Path, table_name: str) -> list[tuple]:
    with sqlite3.connect(db_path) as connection:
        return connection.execute(f'PRAGMA table_info("{table_name}")').fetchall()


def _read_index_list(db_path: Path, table_name: str) -> list[tuple]:
    with sqlite3.connect(db_path) as connection:
        return connection.execute(f'PRAGMA index_list("{table_name}")').fetchall()


def _table_exists(db_path: Path, table_name: str) -> bool:
    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,),
        ).fetchone()
    return row is not None


def test_init_db_adds_missing_user_streak_and_last_practised_columns(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "legacy.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE user (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL,
                email TEXT NOT NULL,
                hashed_password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'student',
                xp INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.commit()

    database_url = f"sqlite:///{db_path}"
    test_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(db, "DATABASE_URL", database_url)
    monkeypatch.setattr(db, "engine", test_engine)

    db.init_db()

    table_info = _read_user_table_info(db_path)
    column_names = [row[1] for row in table_info]
    assert "streak_count" in column_names
    assert "last_practised_date" in column_names

    streak_column = next(row for row in table_info if row[1] == "streak_count")
    assert streak_column[2].upper() == "INTEGER"
    assert streak_column[3] == 1
    assert streak_column[4] == "0"

    last_practised_column = next(
        row for row in table_info if row[1] == "last_practised_date"
    )
    assert last_practised_column[2].upper() == "DATE"
    assert last_practised_column[3] == 0
    assert last_practised_column[4] is None

    db.init_db()
    second_pass_columns = [row[1] for row in _read_user_table_info(db_path)]
    assert second_pass_columns.count("streak_count") == 1
    assert second_pass_columns.count("last_practised_date") == 1


def test_init_db_keeps_fresh_sqlite_create_all_flow(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "fresh.db"
    database_url = f"sqlite:///{db_path}"
    test_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(db, "DATABASE_URL", database_url)
    monkeypatch.setattr(db, "engine", test_engine)

    db.init_db()

    column_names = [row[1] for row in _read_user_table_info(db_path)]
    assert "streak_count" in column_names
    assert "last_practised_date" in column_names

    user_library_columns = [
        row[1] for row in _read_table_info(db_path, "user_library_item")
    ]
    assert "id" in user_library_columns
    assert "user_id" in user_library_columns
    assert "package_id" in user_library_columns
    assert "status" in user_library_columns
    assert "created_at" in user_library_columns
    assert "updated_at" in user_library_columns


def test_init_db_adds_missing_user_library_columns_and_unique_index(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "legacy-library.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE user (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL,
                email TEXT NOT NULL,
                hashed_password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'student',
                xp INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE user_library_item (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                package_id TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES user(id)
            )
            """
        )
        connection.commit()

    database_url = f"sqlite:///{db_path}"
    test_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(db, "DATABASE_URL", database_url)
    monkeypatch.setattr(db, "engine", test_engine)

    db.init_db()

    table_info = _read_table_info(db_path, "user_library_item")
    column_names = [row[1] for row in table_info]
    assert "status" in column_names
    assert "created_at" in column_names
    assert "updated_at" in column_names

    index_names = [row[1] for row in _read_index_list(db_path, "user_library_item")]
    assert "uq_user_library_items_user_package" in index_names

    db.init_db()
    second_pass_columns = [
        row[1] for row in _read_table_info(db_path, "user_library_item")
    ]
    assert second_pass_columns.count("status") == 1
    assert second_pass_columns.count("created_at") == 1
    assert second_pass_columns.count("updated_at") == 1

    second_pass_indexes = [
        row[1] for row in _read_index_list(db_path, "user_library_item")
    ]
    assert second_pass_indexes.count("uq_user_library_items_user_package") == 1


def test_init_db_adds_missing_user_test_result_columns(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "legacy-test-result.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE user (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL,
                email TEXT NOT NULL,
                hashed_password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'student',
                xp INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE usertestresult (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                package_id TEXT NOT NULL,
                latest_weighted_score REAL NOT NULL,
                completed BOOLEAN NOT NULL DEFAULT 0,
                updated_at TIMESTAMP NOT NULL,
                FOREIGN KEY(user_id) REFERENCES user(id)
            )
            """
        )
        connection.commit()

    database_url = f"sqlite:///{db_path}"
    test_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(db, "DATABASE_URL", database_url)
    monkeypatch.setattr(db, "engine", test_engine)

    db.init_db()

    table_info = _read_table_info(db_path, "usertestresult")
    column_names = [row[1] for row in table_info]
    assert "attempt_count" in column_names
    assert "first_completed_at" in column_names

    attempt_count_column = next(row for row in table_info if row[1] == "attempt_count")
    assert attempt_count_column[2].upper() == "INTEGER"
    assert attempt_count_column[3] == 1
    assert attempt_count_column[4] == "1"

    first_completed_at_column = next(
        row for row in table_info if row[1] == "first_completed_at"
    )
    assert first_completed_at_column[2].upper() == "TIMESTAMP"
    assert first_completed_at_column[3] == 0
    assert first_completed_at_column[4] is None

    db.init_db()
    second_pass_columns = [
        row[1] for row in _read_table_info(db_path, "usertestresult")
    ]
    assert second_pass_columns.count("attempt_count") == 1
    assert second_pass_columns.count("first_completed_at") == 1


def test_init_db_creates_user_xp_spend_history_table(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "spend-history.db"
    database_url = f"sqlite:///{db_path}"
    test_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(db, "DATABASE_URL", database_url)
    monkeypatch.setattr(db, "engine", test_engine)

    db.init_db()

    assert _table_exists(db_path, "user_xp_spend_history") is True

    table_info = _read_table_info(db_path, "user_xp_spend_history")
    column_names = [row[1] for row in table_info]
    assert "user_id" in column_names
    assert "action" in column_names
    assert "cost" in column_names
    assert "status" in column_names
    assert "success" in column_names
    assert "refunded" in column_names
    assert "idempotency_key" in column_names
