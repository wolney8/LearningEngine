from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from app.models.package import Package, PackageSummary
from app.models.settings import GameSettings
from app.models.user import SpendHistory, User, UserLibraryItem, UserTestResult
from app.routers.packages import (
    build_package_summary,
    get_package_overrides,
    get_packages_cache,
    list_visible_package_summaries,
)
from app.routers.settings import get_settings
from app.services.db import engine, get_session
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

    difficulty: Literal["easy", "normal", "hard", "expert"] = "normal"
    latest_weighted_score: float = Field(ge=0.0, le=1.0)
    completed: bool
    best_xp_earned: int | None = Field(default=None, ge=0)
    attempt_count: int | None = Field(default=None, ge=1)


class UserTestResultResponse(BaseModel):
    package_id: str
    difficulty: Literal["easy", "normal", "hard", "expert"]
    latest_weighted_score: float
    completed: bool
    best_xp_earned: int
    difficulty_results: dict[str, dict[str, object]] | None
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


class UserProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str | None = None


class UserCatalogueItemResponse(PackageSummary):
    selected: bool


class SpendAction(str, Enum):
    difficulty_unlock = "difficulty_unlock"
    package_unlock = "package_unlock"


class XPSpendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: SpendAction
    package_id: str = Field(min_length=1, max_length=200)
    difficulty: Literal["hard", "expert"] | None = None


class XPSpendResponse(BaseModel):
    xp_remaining: int = Field(ge=0)
    action: str
    package_id: str
    difficulty: str | None
    cost: int = Field(ge=0)
    success: bool


DIFFICULTY_ORDER: tuple[Literal["easy", "normal", "hard", "expert"], ...] = (
    "easy",
    "normal",
    "hard",
    "expert",
)
DifficultyName = Literal["easy", "normal", "hard", "expert"]


def _parse_difficulty_results_json(raw: str | None) -> dict[str, dict[str, object]]:
    if raw is None or raw.strip() == "":
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}

    if not isinstance(parsed, dict):
        return {}

    results: dict[str, dict[str, object]] = {}
    for key, value in parsed.items():
        if key not in DIFFICULTY_ORDER:
            continue
        if not isinstance(value, dict):
            continue
        results[key] = dict(value)
    return results


def _serialise_difficulty_results_json(
    value: dict[str, dict[str, object]],
) -> str | None:
    if not value:
        return None

    ordered: dict[str, dict[str, object]] = {}
    for difficulty in DIFFICULTY_ORDER:
        entry = value.get(difficulty)
        if entry is None:
            continue
        ordered[difficulty] = entry

    if not ordered:
        return None

    return json.dumps(ordered, separators=(",", ":"), sort_keys=True)


def _difficulty_entry_for_response(
    result: UserTestResult,
    difficulty_results: dict[str, dict[str, object]],
    difficulty: DifficultyName,
) -> tuple[float, bool, int, datetime]:
    entry = difficulty_results.get(difficulty)
    if not isinstance(entry, dict):
        return (
            result.latest_weighted_score,
            result.completed,
            result.best_xp_earned,
            result.updated_at,
        )

    score = entry.get("latest_weighted_score")
    completed = entry.get("completed")
    xp = entry.get("best_xp_earned")
    updated_at = entry.get("updated_at")

    safe_score = (
        float(score)
        if isinstance(score, (int, float)) and 0.0 <= float(score) <= 1.0
        else result.latest_weighted_score
    )
    safe_completed = completed if isinstance(completed, bool) else result.completed
    safe_xp = int(xp) if isinstance(xp, int) and xp >= 0 else result.best_xp_earned

    safe_updated_at = result.updated_at
    if isinstance(updated_at, str):
        try:
            candidate = datetime.fromisoformat(updated_at)
            safe_updated_at = (
                candidate
                if candidate.tzinfo is not None
                else candidate.replace(tzinfo=timezone.utc)
            )
        except ValueError:
            safe_updated_at = result.updated_at

    return (safe_score, safe_completed, safe_xp, safe_updated_at)


def _to_test_result_response(result: UserTestResult) -> UserTestResultResponse:
    difficulty_results = _parse_difficulty_results_json(result.difficulty_results_json)
    score, completed, best_xp_earned, updated_at = _difficulty_entry_for_response(
        result,
        difficulty_results,
        "normal",
    )

    return UserTestResultResponse(
        package_id=result.package_id,
        difficulty="normal",
        latest_weighted_score=score,
        completed=completed,
        best_xp_earned=best_xp_earned,
        difficulty_results=difficulty_results or None,
        attempt_count=result.attempt_count,
        first_completed_at=result.first_completed_at,
        updated_at=updated_at,
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


def require_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def require_authenticated_user(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


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


@router.patch("/me/profile", response_model=UserResponse)
async def update_my_profile(
    body: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserResponse:
    if body.username is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided",
        )

    user_id = _require_current_user_id(current_user)
    next_username = body.username.strip()
    if len(next_username) < 3 or len(next_username) > 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username must be between 3 and 50 characters",
        )

    if next_username != current_user.username:
        duplicate_user = session.exec(
            select(User).where(User.username == next_username, User.id != user_id)
        ).first()
        if duplicate_user is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists",
            )

        current_user.username = next_username
        session.add(current_user)
        session.commit()
        session.refresh(current_user)

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
    existing_result = session.exec(
        select(UserTestResult).where(
            UserTestResult.user_id == user_id,
            UserTestResult.package_id == normalised_package_id,
        )
    ).first()

    if existing_item is not None:
        session.delete(existing_item)

    if existing_result is not None:
        session.delete(existing_result)

    if existing_item is not None or existing_result is not None:
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
    settings: GameSettings = Depends(get_settings),
    cache: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> list[UserCatalogueItemResponse]:
    user_id = _require_current_user_id(current_user)

    selected_package_ids = _read_selected_package_ids_for_user(session, user_id)
    visible_summaries = list_visible_package_summaries(cache, overrides)
    package_list = [
        UserCatalogueItemResponse(
            **summary.model_dump(),
            selected=summary.id in selected_package_ids,
        )
        for summary in visible_summaries
    ]

    # If spend economy is enabled, mark packages unlocked by spend as available.
    if settings.spend_economy.enabled and current_user is not None:
        unlocked_ids = {
            row.package_id
            for row in session.exec(
                select(SpendHistory).where(
                    SpendHistory.user_id == current_user.id,
                    SpendHistory.action == SpendAction.package_unlock.value,
                    SpendHistory.success == True,  # noqa: E712
                )
            ).all()
            if row.package_id is not None
        }
        package_list = [
            (
                item.model_copy(update={"availability": "available"})
                if item.id in unlocked_ids and item.availability == "hidden"
                else item
            )
            for item in package_list
        ]

    return package_list


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
    best_xp_earned = body.best_xp_earned or 0

    if existing_result is None:
        initial_difficulty_results = {
            body.difficulty: {
                "latest_weighted_score": body.latest_weighted_score,
                "completed": body.completed,
                "best_xp_earned": best_xp_earned,
                "updated_at": now.isoformat(),
            }
        }
        result = UserTestResult(
            user_id=user_id,
            package_id=normalised_package_id,
            latest_weighted_score=body.latest_weighted_score,
            completed=body.completed,
            best_xp_earned=best_xp_earned,
            difficulty_results_json=_serialise_difficulty_results_json(
                initial_difficulty_results
            ),
            attempt_count=body.attempt_count or 1,
            first_completed_at=now if body.completed else None,
        )
        session.add(result)
    else:
        difficulty_results = _parse_difficulty_results_json(
            existing_result.difficulty_results_json
        )
        current_entry = difficulty_results.get(body.difficulty)
        current_score = (
            float(current_entry.get("latest_weighted_score"))
            if isinstance(current_entry, dict)
            and isinstance(current_entry.get("latest_weighted_score"), (int, float))
            else 0.0
        )
        current_completed = (
            bool(current_entry.get("completed"))
            if isinstance(current_entry, dict)
            and isinstance(current_entry.get("completed"), bool)
            else False
        )
        current_best_xp = (
            int(current_entry.get("best_xp_earned"))
            if isinstance(current_entry, dict)
            and isinstance(current_entry.get("best_xp_earned"), int)
            and int(current_entry.get("best_xp_earned")) >= 0
            else 0
        )

        difficulty_results[body.difficulty] = {
            "latest_weighted_score": max(current_score, body.latest_weighted_score),
            "completed": current_completed or body.completed,
            "best_xp_earned": max(current_best_xp, best_xp_earned),
            "updated_at": now.isoformat(),
        }

        preferred_entry = difficulty_results.get("normal") or difficulty_results.get(
            body.difficulty
        )
        if isinstance(preferred_entry, dict):
            preferred_score = preferred_entry.get("latest_weighted_score")
            preferred_completed = preferred_entry.get("completed")
            preferred_xp = preferred_entry.get("best_xp_earned")

            if isinstance(preferred_score, (int, float)):
                existing_result.latest_weighted_score = min(
                    1.0,
                    max(0.0, float(preferred_score)),
                )
            if isinstance(preferred_completed, bool):
                existing_result.completed = preferred_completed
            if isinstance(preferred_xp, int) and preferred_xp >= 0:
                existing_result.best_xp_earned = preferred_xp

        existing_result.difficulty_results_json = _serialise_difficulty_results_json(
            difficulty_results
        )

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
    response = _to_test_result_response(result)
    response.difficulty = body.difficulty
    score, completed, response_xp, updated_at = _difficulty_entry_for_response(
        result,
        _parse_difficulty_results_json(result.difficulty_results_json),
        body.difficulty,
    )
    response.latest_weighted_score = score
    response.completed = completed
    response.best_xp_earned = response_xp
    response.updated_at = updated_at
    return response


@router.post("/me/xp/spend", response_model=XPSpendResponse)
async def spend_xp(
    body: XPSpendRequest,
    current_user: User = Depends(require_authenticated_user),
    session: Session = Depends(get_session),
    settings: GameSettings = Depends(get_settings),
    cache: dict[str, Package] = Depends(get_packages_cache),
) -> XPSpendResponse:
    """
    Atomically spend XP to unlock a difficulty tier or hidden package.

    SQLite serialises writes - the SELECT + UPDATE within a single Session
    is safe from TOCTOU races in this single-writer SQLite setup.

    Spend flow:
      1. 423 if economy disabled
      2. Validate action-specific fields
      3. Confirm package exists in package cache
      4. Idempotency: 409 if already unlocked
      5. 402 if insufficient XP
      6. Deduct XP + write SpendHistory in one transaction
    """
    if not settings.spend_economy.enabled:
        raise HTTPException(
            status_code=423,
            detail="XP spend economy is currently disabled",
        )

    if body.action == SpendAction.difficulty_unlock and body.difficulty is None:
        raise HTTPException(
            status_code=422,
            detail="'difficulty' is required for difficulty_unlock action",
        )

    normalised_package_id = normalise_package_id(body.package_id)
    if normalised_package_id not in cache:
        raise HTTPException(status_code=404, detail="Package not found")

    existing = session.exec(
        select(SpendHistory).where(
            SpendHistory.user_id == current_user.id,
            SpendHistory.action == body.action.value,
            SpendHistory.package_id == normalised_package_id,
            SpendHistory.difficulty == body.difficulty,
            SpendHistory.success == True,  # noqa: E712
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already unlocked")

    cost = (
        settings.spend_economy.costs.increase_difficulty_cap
        if body.action == SpendAction.difficulty_unlock
        else settings.spend_economy.costs.unlock_hidden_package
    )
    if current_user.xp < cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient XP: need {cost}, have {current_user.xp}",
        )

    try:
        current_user.xp -= cost
        session.add(current_user)
        history_entry = SpendHistory(
            user_id=current_user.id,
            action=body.action.value,
            package_id=normalised_package_id,
            difficulty=body.difficulty,
            cost=cost,
            success=True,
        )
        session.add(history_entry)
        session.commit()
        session.refresh(current_user)
    except Exception:
        session.rollback()
        # Best-effort audit log for failed attempts where no XP was deducted.
        try:
            fail_entry = SpendHistory(
                user_id=current_user.id,
                action=body.action.value,
                package_id=normalised_package_id,
                difficulty=body.difficulty,
                cost=0,
                success=False,
            )
            with Session(engine) as fail_session:
                fail_session.add(fail_entry)
                fail_session.commit()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Spend failed; XP not deducted")

    return XPSpendResponse(
        xp_remaining=current_user.xp,
        action=body.action.value,
        package_id=normalised_package_id,
        difficulty=body.difficulty,
        cost=cost,
        success=True,
    )


@router.get("/me/unlocked-difficulties/{package_id}")
async def get_unlocked_difficulties(
    package_id: str,
    current_user: User = Depends(require_authenticated_user),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    """Return which difficulty tiers the user has unlocked for this package."""
    normalised_package_id = normalise_package_id(package_id)
    rows = session.exec(
        select(SpendHistory).where(
            SpendHistory.user_id == current_user.id,
            SpendHistory.action == SpendAction.difficulty_unlock.value,
            SpendHistory.package_id == normalised_package_id,
            SpendHistory.success == True,  # noqa: E712
        )
    ).all()
    unlocked = {row.difficulty for row in rows}
    return {"hard": "hard" in unlocked, "expert": "expert" in unlocked}
