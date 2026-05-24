from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from app.models.user import User, UserTestResult
from app.services.db import get_session
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


@router.post("/me/progress/{package_id}", response_model=UserTestResultResponse)
async def upsert_my_progress_for_package(
    package_id: str,
    body: UserTestResultUpsertRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserTestResultResponse:
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Current user has no id",
        )

    normalised_package_id = package_id.strip()
    if not normalised_package_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="package_id must not be empty",
        )

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
