from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from app.models.user import User
from app.services.db import get_session
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=8, max_length=128)


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


@router.post("/register", response_model=AuthResponse)
async def register(
    body: RegisterRequest,
    session: Session = Depends(get_session),
) -> AuthResponse:
    username = _normalise_username(body.username)
    email = _normalise_email(body.email)

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
