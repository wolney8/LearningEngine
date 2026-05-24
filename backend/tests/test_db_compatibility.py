from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlmodel import create_engine

from app.services import db


def _read_user_table_info(db_path: Path) -> list[tuple]:
    with sqlite3.connect(db_path) as connection:
        return connection.execute('PRAGMA table_info("user")').fetchall()


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
