from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine

from app.models.user import User, UserLibraryItem


def test_user_library_item_enforces_unique_user_and_package() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = User(
            username="library-user",
            email="library-user@example.com",
            hashed_password="not-used-in-test",
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        user_id = user.id
        assert user_id is not None

        first_item = UserLibraryItem(
            user_id=user_id,
            package_id="sample-demo",
            status="selected",
        )
        session.add(first_item)
        session.commit()

        duplicate_item = UserLibraryItem(
            user_id=user_id,
            package_id="sample-demo",
            status="selected",
        )
        session.add(duplicate_item)

        with pytest.raises(IntegrityError):
            session.commit()

        session.rollback()
