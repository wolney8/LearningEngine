from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from app.models.package import Package, PackageSummary
from app.models.user import User, UserLibraryItem, UserTestResult
from app.routers.packages import (
    build_package_summary,
    get_package_overrides,
    get_packages_cache,
    list_visible_package_summaries,
)
from app.services.db import get_session
from app.services.library_selection import (
    normalise_package_id,
    validate_selectable_package_ids,
)
from app.services.overrides_loader import (
    PackageOverride,
    resolve_effective_availability,
)
from app.services.security import decode_access_token

router = APIRouter(prefix="/users", tags=["users"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    xp: int
    streak_count: int
    last_practised_date: date | None
    created_at: datetime


class UserTestResultUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latest_weighted_score: float = Field(ge=0.0, le=1.0)
    completed: bool
    attempt_count: int | None = Field(default=None, ge=1)


class UserTestResultResponse(BaseModel):
    package_id: str
    latest_weighted_score: float
    completed: bool
    attempt_count: int
    first_completed_at: datetime | None
    updated_at: datetime


class UserXPResponse(BaseModel):
    xp: int = Field(ge=0)


class UserXPUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    xp: int = Field(ge=0)


class UserStreakResponse(BaseModel):
    streak_count: int = Field(ge=0)
    last_practised_date: date | None


class UserCatalogueItemResponse(PackageSummary):
    selected: bool


def _to_test_result_response(result: UserTestResult) -> UserTestResultResponse:
    return UserTestResultResponse(
        package_id=result.package_id,
        latest_weighted_score=result.latest_weighted_score,
        completed=result.completed,
        attempt_count=result.attempt_count,
        first_completed_at=result.first_completed_at,
        updated_at=result.updated_at,
    )


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _read_selected_package_ids_for_user(
    session: Session,
    user_id: int,
) -> set[str]:
    rows = session.exec(
        select(UserLibraryItem.package_id)
        .where(UserLibraryItem.user_id == user_id)
        .order_by(UserLibraryItem.package_id)
    ).all()
    return set(rows)


def _require_current_user_id(current_user: User) -> int:
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Current user has no id",
        )
    return user_id


def _build_catalogue_item_response(
    package_id: str,
    *,
    selected: bool,
    cache: dict[str, Package],
    overrides: dict[str, PackageOverride],
) -> UserCatalogueItemResponse:
    pkg = cache[package_id]
    summary = build_package_summary(pkg, overrides.get(package_id))
    return UserCatalogueItemResponse(**summary.model_dump(), selected=selected)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.isdigit():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = session.exec(select(User).where(User.id == int(subject))).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


@router.get("/me", response_model=UserResponse)
async def read_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=current_user.id or 0,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        xp=current_user.xp,
        streak_count=current_user.streak_count,
        last_practised_date=current_user.last_practised_date,
        created_at=current_user.created_at,
    )


@router.get("/me/xp", response_model=UserXPResponse)
async def read_my_xp(current_user: User = Depends(get_current_user)) -> UserXPResponse:
    return UserXPResponse(xp=current_user.xp)


@router.put("/me/xp", response_model=UserXPResponse)
async def update_my_xp(
    body: UserXPUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserXPResponse:
    current_user.xp = body.xp
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return UserXPResponse(xp=current_user.xp)


@router.get("/me/streak", response_model=UserStreakResponse)
async def read_my_streak(
    current_user: User = Depends(get_current_user),
) -> UserStreakResponse:
    return UserStreakResponse(
        streak_count=current_user.streak_count,
        last_practised_date=current_user.last_practised_date,
    )


@router.post("/me/streak/mark-practised", response_model=UserStreakResponse)
async def mark_my_streak_practised_today(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserStreakResponse:
    today = _utc_today()
    previous = current_user.last_practised_date

    if previous == today:
        return UserStreakResponse(
            streak_count=current_user.streak_count,
            last_practised_date=current_user.last_practised_date,
        )

    if previous == (today - timedelta(days=1)):
        current_user.streak_count += 1
    else:
        current_user.streak_count = 1

    current_user.last_practised_date = today
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return UserStreakResponse(
        streak_count=current_user.streak_count,
        last_practised_date=current_user.last_practised_date,
    )


@router.get("/me/progress", response_model=list[UserTestResultResponse])
async def read_my_progress(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[UserTestResultResponse]:
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Current user has no id",
        )

    results = session.exec(
        select(UserTestResult)
        .where(UserTestResult.user_id == user_id)
        .order_by(UserTestResult.package_id)
    ).all()
    return [_to_test_result_response(result) for result in results]


@router.get("/me/library", response_model=list[PackageSummary])
async def read_my_library(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    cache: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> list[PackageSummary]:
    user_id = _require_current_user_id(current_user)

    selected_package_ids = session.exec(
        select(UserLibraryItem.package_id)
        .where(UserLibraryItem.user_id == user_id)
        .order_by(UserLibraryItem.package_id)
    ).all()

    summaries: list[PackageSummary] = []
    for package_id in selected_package_ids:
        pkg = cache.get(package_id)
        if pkg is None:
            continue

        override = overrides.get(package_id)
        availability = resolve_effective_availability(override)
        if availability == "hidden":
            continue

        summaries.append(build_package_summary(pkg, override))

    return summaries


@router.put("/me/library/{package_id}", response_model=UserCatalogueItemResponse)
async def select_my_library_package(
    package_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    cache: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> UserCatalogueItemResponse:
    user_id = _require_current_user_id(current_user)
    normalised_package_id = normalise_package_id(package_id)
    validate_selectable_package_ids(
        [normalised_package_id],
        cache,
        overrides,
        detail_field="package_id",
    )

    existing_item = session.exec(
        select(UserLibraryItem).where(
            UserLibraryItem.user_id == user_id,
            UserLibraryItem.package_id == normalised_package_id,
        )
    ).first()
    if existing_item is None:
        session.add(
            UserLibraryItem(
                user_id=user_id,
                package_id=normalised_package_id,
                status="selected",
            )
        )
        session.commit()

    return _build_catalogue_item_response(
        normalised_package_id,
        selected=True,
        cache=cache,
        overrides=overrides,
    )


@router.delete("/me/library/{package_id}", response_model=UserCatalogueItemResponse)
async def deselect_my_library_package(
    package_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    cache: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> UserCatalogueItemResponse:
    user_id = _require_current_user_id(current_user)
    normalised_package_id = normalise_package_id(package_id)
    validate_selectable_package_ids(
        [normalised_package_id],
        cache,
        overrides,
        detail_field="package_id",
    )

    existing_item = session.exec(
        select(UserLibraryItem).where(
            UserLibraryItem.user_id == user_id,
            UserLibraryItem.package_id == normalised_package_id,
        )
    ).first()
    if existing_item is not None:
        session.delete(existing_item)
        session.commit()

    return _build_catalogue_item_response(
        normalised_package_id,
        selected=False,
        cache=cache,
        overrides=overrides,
    )


@router.get("/me/catalogue", response_model=list[UserCatalogueItemResponse])
async def read_my_catalogue(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    cache: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> list[UserCatalogueItemResponse]:
    user_id = _require_current_user_id(current_user)

    selected_package_ids = _read_selected_package_ids_for_user(session, user_id)
    visible_summaries = list_visible_package_summaries(cache, overrides)
    return [
        UserCatalogueItemResponse(
            **summary.model_dump(),
            selected=summary.id in selected_package_ids,
        )
        for summary in visible_summaries
    ]


@router.post("/me/progress/{package_id}", response_model=UserTestResultResponse)
async def upsert_my_progress_for_package(
    package_id: str,
    body: UserTestResultUpsertRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserTestResultResponse:
    user_id = _require_current_user_id(current_user)
    normalised_package_id = normalise_package_id(package_id)

    existing_result = session.exec(
        select(UserTestResult).where(
            UserTestResult.user_id == user_id,
            UserTestResult.package_id == normalised_package_id,
        )
    ).first()
    now = datetime.now(timezone.utc)

    if existing_result is None:
        result = UserTestResult(
            user_id=user_id,
            package_id=normalised_package_id,
            latest_weighted_score=body.latest_weighted_score,
            completed=body.completed,
            attempt_count=body.attempt_count or 1,
            first_completed_at=now if body.completed else None,
        )
        session.add(result)
    else:
        existing_result.latest_weighted_score = body.latest_weighted_score
        existing_result.completed = body.completed
        if body.attempt_count is None:
            existing_result.attempt_count += 1
        else:
            existing_result.attempt_count = body.attempt_count
        if existing_result.first_completed_at is None and body.completed:
            existing_result.first_completed_at = now
        existing_result.updated_at = now
        result = existing_result

    session.commit()
    session.refresh(result)
    return _to_test_result_response(result)
