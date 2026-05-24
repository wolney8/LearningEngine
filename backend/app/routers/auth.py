from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from app.models.package import Package
from app.models.user import User, UserLibraryItem
from app.routers.packages import get_package_overrides, get_packages_cache
from app.services.db import get_session
from app.services.overrides_loader import (
    PackageOverride,
    resolve_effective_availability,
)
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    selected_package_ids: list[str] | None = None


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username_or_email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    xp: int
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


def _normalise_username(value: str) -> str:
    return value.strip().lower()


def _normalise_email(value: str) -> str:
    return value.strip().lower()


def _to_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id or 0,
        username=user.username,
        email=user.email,
        role=user.role,
        xp=user.xp,
        created_at=user.created_at,
    )


def _deduplicate_package_ids(package_ids: list[str]) -> list[str]:
    deduplicated: list[str] = []
    seen: set[str] = set()
    for raw_package_id in package_ids:
        package_id = raw_package_id.strip()
        if not package_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="selected_package_ids must not contain empty values",
            )
        if package_id in seen:
            continue
        seen.add(package_id)
        deduplicated.append(package_id)
    return deduplicated


def _build_selectable_package_id_universe(
    cache: dict[str, Package],
    overrides: dict[str, PackageOverride],
) -> set[str]:
    selectable_ids: set[str] = set()
    for pkg_id in cache:
        availability = resolve_effective_availability(overrides.get(pkg_id))
        if availability != "hidden":
            selectable_ids.add(pkg_id)
    return selectable_ids


@router.post("/register", response_model=AuthResponse)
async def register(
    body: RegisterRequest,
    session: Session = Depends(get_session),
    cache: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> AuthResponse:
    username = _normalise_username(body.username)
    email = _normalise_email(body.email)
    selected_package_ids = _deduplicate_package_ids(body.selected_package_ids or [])
    selectable_ids = _build_selectable_package_id_universe(cache, overrides)
    invalid_package_ids = [
        package_id
        for package_id in selected_package_ids
        if package_id not in selectable_ids
    ]
    if invalid_package_ids:
        message = (
            "selected_package_ids contains unknown or hidden package ids"
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": message,
                "invalid_package_ids": invalid_package_ids,
            },
        )

    existing_username = session.exec(
        select(User).where(User.username == username)
    ).first()
    if existing_username is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken",
        )

    existing_email = session.exec(select(User).where(User.email == email)).first()
    if existing_email is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        )

    user = User(
        username=username,
        email=email,
        hashed_password=hash_password(body.password),
    )
    session.add(user)

    session.flush()
    user_id = user.id
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user",
        )

    for package_id in selected_package_ids:
        session.add(
            UserLibraryItem(
                user_id=user_id,
                package_id=package_id,
                status="selected",
            )
        )

    session.commit()
    session.refresh(user)

    token = create_access_token(subject=str(user.id), role=user.role)
    return AuthResponse(access_token=token, user=_to_user_response(user))


@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    session: Session = Depends(get_session),
) -> AuthResponse:
    identity = body.username_or_email.strip().lower()
    user = session.exec(select(User).where(User.username == identity)).first()
    if user is None:
        user = session.exec(select(User).where(User.email == identity)).first()

    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password",
        )

    token = create_access_token(subject=str(user.id), role=user.role)
    return AuthResponse(access_token=token, user=_to_user_response(user))
