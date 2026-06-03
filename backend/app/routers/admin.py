from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Literal

import yaml
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlmodel import Session, select

from app.models.package import AdminPackageSummary, Package, PackageSummary
from app.models.refresh import (
    PackageAdminMetadataRecord,
    RefreshResult,
    StalePackageInfo,
)
from app.models.settings import GameSettings
from app.models.user import (
    AdminAuditLog,
    SpendHistory,
    User,
    UserLibraryItem,
    UserTestResult,
)
from app.routers.users import require_admin_user
from app.services.ai_generator import (
    AI_ERROR_CODE_MISSING_API_KEY,
    AI_ERROR_CODE_PROVIDER_OVERLOADED,
    AI_ERROR_CODE_PROVIDER_UNAVAILABLE,
    AI_ERROR_CODE_UPSTREAM_FAILURE,
    DEFAULT_GEMINI_MODEL,
    AIGenerationError,
    generate_package,
    refresh_package,
    test_connection,
)
from app.services.db import get_session
from app.services.overrides_loader import (
    OVERRIDES_FILE,
    PackageOverride,
    derive_enabled_from_availability,
    resolve_effective_availability,
    save_package_overrides,
)
from app.services.package_loader import PACKAGES_DIR
from app.services.refresh_metadata_loader import (
    REFRESH_METADATA_FILE,
    save_refresh_metadata,
)
from app.services.refresh_service import (
    _bump_patch_version,
    compute_diff_summary,
    detect_stale_packages,
    write_refreshed_package,
)
from app.services.settings_loader import SETTINGS_FILE, load_settings, save_settings

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_user)],
)


class PackageOverridePatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    availability: Literal["available", "unavailable", "hidden"] | None = None
    enabled: bool | None = None
    xp_threshold: int | None = Field(default=None, ge=0)
    tags: list[str] | None = None

    @model_validator(mode="after")
    def validate_at_least_one_field(self) -> "PackageOverridePatchRequest":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class PublishPackageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    yaml_content: str = Field(min_length=1)


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic: str = Field(min_length=3, max_length=500)
    audience: str = Field(default="general learners", max_length=200)
    num_pages: int = Field(default=3, ge=1, le=10)
    num_questions: int = Field(default=8, ge=8, le=20)


class GenerateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    yaml_content: str


class AdminAIConfigResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["gemini"]
    model: str
    key_present: bool


class AdminAIConfigUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["gemini"]
    model: str = Field(min_length=1)


class AdminAIConnectionTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_key: str = Field(min_length=1)
    provider: Literal["gemini"] | None = None
    model: str | None = Field(default=None, min_length=1)


class AdminAIConnectionTestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    message: str
    model_used: str


class AdminUserSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    email: str
    role: Literal["student", "admin"]
    xp: int
    pending_bonus_xp: int
    pending_bonus_reason: str | None
    created_at: datetime


class AdminUserRoleUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["student", "admin"]


class AdminUserXPSetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    xp: int = Field(ge=0)


class AdminUserXPBonusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    xp: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=500)


class AdminUserXPResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    role: Literal["student", "admin"]
    xp: int
    pending_bonus_xp: int
    pending_bonus_reason: str | None


class AdminUserProgressResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reset_xp: bool = False


class AdminUserProgressResetResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    role: Literal["student", "admin"]
    xp: int
    pending_bonus_xp: int
    pending_bonus_reason: str | None
    cleared_progress_count: int
    reset_xp: bool


class AdminUserDeleteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    deleted_progress_count: int
    deleted_library_count: int
    deleted_spend_history_count: int
    deleted_audit_log_count: int


class AdminPackageDeleteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    package_id: str
    operation: Literal["archived", "deleted"]
    summary: PackageSummary | None = None


class AdminAuditLogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    actor_user_id: int
    action: str
    target_user_id: int | None
    package_id: str | None
    details: dict[str, Any]
    created_at: datetime


def to_admin_user_summary(user: User) -> AdminUserSummary:
    return AdminUserSummary(
        id=user.id or 0,
        username=user.username,
        email=user.email,
        role=user.role,
        xp=user.xp,
        pending_bonus_xp=user.pending_bonus_xp,
        pending_bonus_reason=user.pending_bonus_reason,
        created_at=user.created_at,
    )


def to_admin_user_xp_response(user: User) -> AdminUserXPResponse:
    return AdminUserXPResponse(
        id=user.id or 0,
        username=user.username,
        role=user.role,
        xp=user.xp,
        pending_bonus_xp=user.pending_bonus_xp,
        pending_bonus_reason=user.pending_bonus_reason,
    )


def to_admin_user_progress_reset_response(
    user: User,
    *,
    cleared_progress_count: int,
    reset_xp: bool,
) -> AdminUserProgressResetResponse:
    return AdminUserProgressResetResponse(
        id=user.id or 0,
        username=user.username,
        role=user.role,
        xp=user.xp,
        pending_bonus_xp=user.pending_bonus_xp,
        pending_bonus_reason=user.pending_bonus_reason,
        cleared_progress_count=cleared_progress_count,
        reset_xp=reset_xp,
    )


def to_admin_user_delete_response(
    *,
    user_id: int,
    username: str,
    deleted_progress_count: int,
    deleted_library_count: int,
    deleted_spend_history_count: int,
    deleted_audit_log_count: int,
) -> AdminUserDeleteResponse:
    return AdminUserDeleteResponse(
        id=user_id,
        username=username,
        deleted_progress_count=deleted_progress_count,
        deleted_library_count=deleted_library_count,
        deleted_spend_history_count=deleted_spend_history_count,
        deleted_audit_log_count=deleted_audit_log_count,
    )


def _get_user_or_404(session: Session, user_id: int) -> User:
    user = session.exec(select(User).where(User.id == user_id)).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _log_admin_action(
    session: Session,
    *,
    actor_user_id: int,
    action: str,
    target_user_id: int | None = None,
    package_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    session.add(
        AdminAuditLog(
            actor_user_id=actor_user_id,
            action=action,
            target_user_id=target_user_id,
            package_id=package_id,
            details_json=json.dumps(details or {}, sort_keys=True),
        )
    )


def _to_admin_audit_log_entry(entry: AdminAuditLog) -> AdminAuditLogEntry:
    try:
        details_raw = json.loads(entry.details_json)
    except json.JSONDecodeError:
        details_raw = {"raw": entry.details_json}

    if not isinstance(details_raw, dict):
        details_raw = {"value": details_raw}

    return AdminAuditLogEntry(
        id=entry.id or 0,
        actor_user_id=entry.actor_user_id,
        action=entry.action,
        target_user_id=entry.target_user_id,
        package_id=entry.package_id,
        details=details_raw,
        created_at=entry.created_at,
    )


def _collect_changed_key_paths(
    previous: Any,
    current: Any,
    *,
    prefix: str = "",
) -> list[str]:
    if isinstance(previous, dict) and isinstance(current, dict):
        changed: list[str] = []
        keys = sorted(set(previous.keys()) | set(current.keys()))
        for key in keys:
            key_str = str(key)
            child_prefix = f"{prefix}.{key_str}" if prefix else key_str
            if key not in previous or key not in current:
                changed.append(child_prefix)
                continue
            changed.extend(
                _collect_changed_key_paths(
                    previous[key],
                    current[key],
                    prefix=child_prefix,
                )
            )
        return changed

    if previous != current and prefix:
        return [prefix]

    return []


def _normalise_query_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_settings_cache(request: Request) -> GameSettings:
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        settings = load_settings()
        request.app.state.settings = settings
    return settings


def get_packages_cache(request: Request) -> dict[str, Package]:
    return request.app.state.packages


def get_package_overrides(request: Request) -> dict[str, PackageOverride]:
    return request.app.state.package_overrides


def get_refresh_metadata_cache(
    request: Request,
) -> dict[str, PackageAdminMetadataRecord]:
    return request.app.state.refresh_metadata


def build_package_summary(
    pkg: Package,
    override: PackageOverride | None,
) -> PackageSummary:
    availability = resolve_effective_availability(override)
    return PackageSummary(
        id=pkg.id,
        title=pkg.title,
        description=pkg.description,
        version=pkg.version,
        tags=pkg.tags,
        passing_score=pkg.passing_score,
        page_count=len(pkg.pages),
        question_count=len(pkg.questions),
        availability=availability,
        enabled=derive_enabled_from_availability(availability),
        xp_threshold=override.xp_threshold if override else None,
    )


def build_admin_package_summary(
    pkg: Package,
    override: PackageOverride | None,
    metadata: PackageAdminMetadataRecord | None,
) -> AdminPackageSummary:
    base_summary = build_package_summary(pkg, override)
    return AdminPackageSummary(
        **base_summary.model_dump(),
        added_at=metadata.added_at if metadata else None,
        last_refreshed_at=metadata.last_refreshed_at if metadata else None,
    )


def build_ai_config_response(settings: GameSettings) -> AdminAIConfigResponse:
    return AdminAIConfigResponse(
        provider=settings.ai.provider,
        model=settings.ai.model,
        key_present=bool(os.getenv("GEMINI_API_KEY")),
    )


def _build_ai_error_detail(exc: AIGenerationError) -> dict[str, str]:
    code = exc.error_code
    safe_messages = {
        AI_ERROR_CODE_MISSING_API_KEY: (
            "AI service is not configured. Ask an administrator to add the API key."
        ),
        AI_ERROR_CODE_PROVIDER_OVERLOADED: (
            "AI provider is experiencing high demand. Please try again shortly."
        ),
        AI_ERROR_CODE_PROVIDER_UNAVAILABLE: (
            "AI provider is temporarily unavailable. Please try again shortly."
        ),
        AI_ERROR_CODE_UPSTREAM_FAILURE: (
            "AI generation failed due to an upstream provider error. Please try again."
        ),
    }
    return {
        "error_code": code,
        "message": safe_messages.get(
            code,
            "AI generation failed due to an upstream provider error. Please try again.",
        ),
    }


def _resolve_ai_test_model(settings: GameSettings, model_override: str | None) -> str:
    return model_override or settings.ai.model or os.getenv(
        "GEMINI_MODEL", DEFAULT_GEMINI_MODEL
    )


def _build_ai_connection_test_failure_message(error_code: str) -> str:
    if error_code == AI_ERROR_CODE_PROVIDER_OVERLOADED:
        return (
            "AI provider is under high demand. Try again shortly or switch to a "
            "different model."
        )
    if error_code == AI_ERROR_CODE_PROVIDER_UNAVAILABLE:
        return "AI provider is temporarily unavailable. Please try again shortly."
    if error_code == AI_ERROR_CODE_MISSING_API_KEY:
        return "AI API key is missing or invalid. Check the key and AI configuration."
    return "Connection test failed. Check provider, model, and API key."


def _normalise_tags(raw_tags: list[str] | None) -> list[str]:
    if raw_tags is None:
        return []

    normalised: list[str] = []
    seen: set[str] = set()
    for raw_tag in raw_tags:
        tag = raw_tag.strip()
        if not tag:
            continue
        dedupe_key = tag.casefold()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalised.append(tag)
    return normalised


def _write_package_yaml_file(pkg: Package, package_file: str) -> None:
    content = yaml.dump(
        pkg.model_dump(mode="json"),
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    package_path = PACKAGES_DIR / package_file
    package_path.parent.mkdir(parents=True, exist_ok=True)
    package_path.write_text(content, encoding="utf-8")


@router.get(
    "/settings",
    response_model=GameSettings,
)
async def read_admin_settings(
    settings: GameSettings = Depends(get_settings_cache),
) -> GameSettings:
    return settings


@router.put(
    "/settings",
    response_model=GameSettings,
)
async def update_admin_settings(
    body: GameSettings,
    request: Request,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
    current_settings: GameSettings = Depends(get_settings_cache),
) -> GameSettings:
    previous_payload = current_settings.model_dump(mode="json")
    next_payload = body.model_dump(mode="json")
    changed_keys = _collect_changed_key_paths(previous_payload, next_payload)

    save_settings(body, SETTINGS_FILE)
    request.app.state.settings = body

    if changed_keys:
        celebration_changed_keys = [
            key
            for key in changed_keys
            if key == "celebration_effects"
            or key.startswith("celebration_effects.")
        ]
        _log_admin_action(
            session,
            actor_user_id=current_admin.id or 0,
            action="settings.updated",
            details={
                "changed_count": len(changed_keys),
                "changed_keys": changed_keys,
                "celebration_effects_changed_keys": celebration_changed_keys,
            },
        )
        session.commit()

    return body


@router.get(
    "/ai-config",
    response_model=AdminAIConfigResponse,
)
async def read_admin_ai_config(
    settings: GameSettings = Depends(get_settings_cache),
) -> AdminAIConfigResponse:
    return build_ai_config_response(settings)


async def _update_admin_ai_config(
    body: AdminAIConfigUpdateRequest,
    request: Request,
    settings: GameSettings,
) -> AdminAIConfigResponse:
    updated_ai = settings.ai.model_copy(
        update={"provider": body.provider, "model": body.model}
    )
    updated_settings = settings.model_copy(update={"ai": updated_ai})
    save_settings(updated_settings, SETTINGS_FILE)
    request.app.state.settings = updated_settings
    return build_ai_config_response(updated_settings)


@router.put(
    "/ai-config",
    response_model=AdminAIConfigResponse,
)
async def update_admin_ai_config_put(
    body: AdminAIConfigUpdateRequest,
    request: Request,
    settings: GameSettings = Depends(get_settings_cache),
) -> AdminAIConfigResponse:
    return await _update_admin_ai_config(body, request, settings)


@router.patch(
    "/ai-config",
    response_model=AdminAIConfigResponse,
)
async def update_admin_ai_config_patch(
    body: AdminAIConfigUpdateRequest,
    request: Request,
    settings: GameSettings = Depends(get_settings_cache),
) -> AdminAIConfigResponse:
    return await _update_admin_ai_config(body, request, settings)


@router.post(
    "/ai-config/test",
    response_model=AdminAIConnectionTestResponse,
)
async def test_admin_ai_connection(
    body: AdminAIConnectionTestRequest,
    settings: GameSettings = Depends(get_settings_cache),
) -> AdminAIConnectionTestResponse:
    model_used = _resolve_ai_test_model(settings, body.model)

    try:
        tested_model = await test_connection(
            settings=settings,
            api_key=body.api_key,
            provider_override=body.provider,
            model_override=body.model,
        )
    except AIGenerationError as exc:
        return AdminAIConnectionTestResponse(
            success=False,
            message=_build_ai_connection_test_failure_message(exc.error_code),
            model_used=model_used,
        )

    return AdminAIConnectionTestResponse(
        success=True,
        message="Connection test succeeded.",
        model_used=tested_model or model_used,
    )


@router.get(
    "/packages",
    response_model=list[AdminPackageSummary],
)
async def list_admin_packages(
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
) -> list[AdminPackageSummary]:
    return [
        build_admin_package_summary(
            pkg,
            overrides.get(pkg.id),
            refresh_metadata.get(pkg.id),
        )
        for pkg in packages.values()
    ]


@router.get(
    "/users",
    response_model=list[AdminUserSummary],
)
async def list_admin_users(
    session: Session = Depends(get_session),
) -> list[AdminUserSummary]:
    users = session.exec(select(User).order_by(User.created_at, User.id)).all()
    return [to_admin_user_summary(user) for user in users]


@router.patch(
    "/users/{user_id}/role",
    response_model=AdminUserSummary,
)
async def patch_admin_user_role(
    user_id: int,
    body: AdminUserRoleUpdateRequest,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserSummary:
    user = _get_user_or_404(session, user_id)
    previous_role = user.role

    if user.role == body.role:
        return to_admin_user_summary(user)

    if user.role == "admin" and body.role != "admin":
        admin_count = len(session.exec(select(User).where(User.role == "admin")).all())
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Cannot remove admin role from the last remaining admin user"
                ),
            )

    user.role = body.role
    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.role_changed",
        target_user_id=user.id,
        details={"from_role": previous_role, "to_role": body.role},
    )
    session.commit()
    session.refresh(user)
    return to_admin_user_summary(user)


@router.patch(
    "/users/{user_id}/xp/set",
    response_model=AdminUserXPResponse,
)
async def patch_admin_user_xp_set(
    user_id: int,
    body: AdminUserXPSetRequest,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserXPResponse:
    user = _get_user_or_404(session, user_id)
    previous_xp = user.xp
    user.xp = body.xp
    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.xp_set",
        target_user_id=user.id,
        details={"from_xp": previous_xp, "to_xp": body.xp},
    )
    session.commit()
    session.refresh(user)
    return to_admin_user_xp_response(user)


@router.post(
    "/users/{user_id}/xp/reset",
    response_model=AdminUserXPResponse,
)
async def post_admin_user_xp_reset(
    user_id: int,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserXPResponse:
    user = _get_user_or_404(session, user_id)
    previous_xp = user.xp
    previous_pending_bonus_xp = user.pending_bonus_xp
    previous_pending_bonus_reason = user.pending_bonus_reason
    user.xp = 0
    user.pending_bonus_xp = 0
    user.pending_bonus_reason = None
    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.xp_reset",
        target_user_id=user.id,
        details={
            "from_xp": previous_xp,
            "from_pending_bonus_xp": previous_pending_bonus_xp,
            "from_pending_bonus_reason": previous_pending_bonus_reason,
        },
    )
    session.commit()
    session.refresh(user)
    return to_admin_user_xp_response(user)


@router.post(
    "/users/{user_id}/xp/bonus",
    response_model=AdminUserXPResponse,
)
async def post_admin_user_xp_bonus(
    user_id: int,
    body: AdminUserXPBonusRequest,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserXPResponse:
    user = _get_user_or_404(session, user_id)
    previous_xp = user.xp
    user.xp += body.xp
    user.pending_bonus_xp = body.xp
    user.pending_bonus_reason = body.reason.strip()
    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.xp_bonus_applied",
        target_user_id=user.id,
        details={
            "bonus_xp": body.xp,
            "reason": user.pending_bonus_reason,
            "from_xp": previous_xp,
            "to_xp": user.xp,
        },
    )
    session.commit()
    session.refresh(user)
    return to_admin_user_xp_response(user)


@router.post(
    "/users/{user_id}/progress/reset",
    response_model=AdminUserProgressResetResponse,
)
async def post_admin_user_progress_reset(
    user_id: int,
    body: AdminUserProgressResetRequest | None = None,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserProgressResetResponse:
    user = _get_user_or_404(session, user_id)
    reset_xp = bool(body.reset_xp) if body is not None else False
    previous_xp = user.xp
    previous_pending_bonus_xp = user.pending_bonus_xp
    previous_pending_bonus_reason = user.pending_bonus_reason

    user_results = session.exec(
        select(UserTestResult).where(UserTestResult.user_id == user_id)
    ).all()
    for result in user_results:
        session.delete(result)

    if reset_xp:
        user.xp = 0
        user.pending_bonus_xp = 0
        user.pending_bonus_reason = None

    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.progress_reset",
        target_user_id=user.id,
        details={
            "cleared_progress_count": len(user_results),
            "reset_xp": reset_xp,
            "from_xp": previous_xp,
            "to_xp": user.xp,
            "from_pending_bonus_xp": previous_pending_bonus_xp,
            "from_pending_bonus_reason": previous_pending_bonus_reason,
        },
    )
    session.commit()
    session.refresh(user)

    return to_admin_user_progress_reset_response(
        user,
        cleared_progress_count=len(user_results),
        reset_xp=reset_xp,
    )


@router.delete(
    "/users/{user_id}",
    response_model=AdminUserDeleteResponse,
)
async def delete_admin_user(
    user_id: int,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserDeleteResponse:
    current_admin_id = current_admin.id or 0
    if user_id == current_admin_id:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete the currently signed-in admin user",
        )

    user = _get_user_or_404(session, user_id)

    if user.role == "admin":
        admin_count = len(session.exec(select(User).where(User.role == "admin")).all())
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail="Cannot delete the last remaining admin user",
            )

    deleted_username = user.username

    user_results = session.exec(
        select(UserTestResult).where(UserTestResult.user_id == user_id)
    ).all()
    user_library_items = session.exec(
        select(UserLibraryItem).where(UserLibraryItem.user_id == user_id)
    ).all()
    spend_history_rows = session.exec(
        select(SpendHistory).where(SpendHistory.user_id == user_id)
    ).all()
    audit_rows = session.exec(
        select(AdminAuditLog).where(
            (AdminAuditLog.actor_user_id == user_id)
            | (AdminAuditLog.target_user_id == user_id)
        )
    ).all()

    for row in user_results:
        session.delete(row)
    for row in user_library_items:
        session.delete(row)
    for row in spend_history_rows:
        session.delete(row)
    for row in audit_rows:
        session.delete(row)

    session.delete(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin_id,
        action="user.deleted",
        details={
            "deleted_user_id": user_id,
            "deleted_username": deleted_username,
            "deleted_progress_count": len(user_results),
            "deleted_library_count": len(user_library_items),
            "deleted_spend_history_count": len(spend_history_rows),
            "deleted_audit_log_count": len(audit_rows),
        },
    )
    session.commit()

    return to_admin_user_delete_response(
        user_id=user_id,
        username=deleted_username,
        deleted_progress_count=len(user_results),
        deleted_library_count=len(user_library_items),
        deleted_spend_history_count=len(spend_history_rows),
        deleted_audit_log_count=len(audit_rows),
    )


@router.patch(
    "/packages/{package_id}",
    response_model=PackageSummary,
)
async def patch_admin_package(
    package_id: str,
    body: PackageOverridePatchRequest,
    request: Request,
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> PackageSummary:
    pkg = packages.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    updated_pkg = pkg
    if "tags" in body.model_fields_set:
        normalised_tags = _normalise_tags(body.tags)
        updated_pkg = pkg.model_copy(update={"tags": normalised_tags})
        try:
            _write_package_yaml_file(updated_pkg, f"{package_id}.yaml")
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail="Failed to write package file",
            ) from exc
        packages[package_id] = updated_pkg
        request.app.state.packages = packages

    current = overrides.get(package_id, PackageOverride())
    update_data: dict[str, Any] = {}
    if "availability" in body.model_fields_set:
        update_data["availability"] = body.availability
        update_data["enabled"] = None
    elif "enabled" in body.model_fields_set:
        update_data["availability"] = "available" if body.enabled else "unavailable"
        update_data["enabled"] = None
    if "xp_threshold" in body.model_fields_set:
        update_data["xp_threshold"] = body.xp_threshold

    updated_override = current.model_copy(update=update_data)
    overrides[package_id] = updated_override

    save_package_overrides(overrides, OVERRIDES_FILE)
    request.app.state.package_overrides = overrides

    return build_package_summary(updated_pkg, updated_override)


@router.delete(
    "/packages/{package_id}",
    response_model=AdminPackageDeleteResponse,
)
async def delete_admin_package(
    package_id: str,
    request: Request,
    permanent: bool = False,
    confirm: bool = False,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
) -> AdminPackageDeleteResponse:
    pkg = packages.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    if not permanent:
        current = overrides.get(package_id, PackageOverride())
        archived_override = current.model_copy(
            update={"availability": "hidden", "enabled": None}
        )
        overrides[package_id] = archived_override

        save_package_overrides(overrides, OVERRIDES_FILE)
        request.app.state.package_overrides = overrides

        _log_admin_action(
            session,
            actor_user_id=current_admin.id or 0,
            action="package.archived",
            package_id=package_id,
            details={"permanent": False},
        )
        session.commit()

        return AdminPackageDeleteResponse(
            package_id=package_id,
            operation="archived",
            summary=build_package_summary(pkg, archived_override),
        )

    if not confirm:
        raise HTTPException(
            status_code=400,
            detail=(
                "Permanent delete requires confirm=true. "
                "Use archive mode (default) for reversible removal."
            ),
        )

    if len(packages) <= 1:
        raise HTTPException(
            status_code=409,
            detail="Cannot permanently delete the last remaining package",
        )

    package_file = PACKAGES_DIR / f"{package_id}.yaml"
    if package_file.exists():
        try:
            package_file.unlink()
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail="Failed to delete package file",
            ) from exc

    packages.pop(package_id, None)
    overrides.pop(package_id, None)
    refresh_metadata.pop(package_id, None)

    save_package_overrides(overrides, OVERRIDES_FILE)
    save_refresh_metadata(refresh_metadata, REFRESH_METADATA_FILE)

    request.app.state.packages = packages
    request.app.state.package_overrides = overrides
    request.app.state.refresh_metadata = refresh_metadata

    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="package.permanently_deleted",
        package_id=package_id,
        details={"permanent": True},
    )
    session.commit()

    return AdminPackageDeleteResponse(
        package_id=package_id,
        operation="deleted",
    )


@router.get(
    "/audit-logs",
    response_model=list[AdminAuditLogEntry],
)
async def list_admin_audit_logs(
    limit: int = Query(default=50, ge=1, le=500),
    action: str | None = Query(default=None, min_length=1, max_length=100),
    actor_user_id: int | None = Query(default=None, ge=1),
    from_timestamp: datetime | None = Query(default=None, alias="from"),
    until_timestamp: datetime | None = Query(default=None, alias="until"),
    session: Session = Depends(get_session),
) -> list[AdminAuditLogEntry]:
    from_timestamp = _normalise_query_timestamp(from_timestamp)
    until_timestamp = _normalise_query_timestamp(until_timestamp)
    if (
        from_timestamp is not None
        and until_timestamp is not None
        and from_timestamp > until_timestamp
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Invalid audit log date range: "
                "from must be before or equal to until"
            ),
        )

    query = select(AdminAuditLog)
    if action is not None:
        query = query.where(AdminAuditLog.action.contains(action))
    if actor_user_id is not None:
        query = query.where(AdminAuditLog.actor_user_id == actor_user_id)
    if from_timestamp is not None:
        query = query.where(AdminAuditLog.created_at >= from_timestamp)
    if until_timestamp is not None:
        query = query.where(AdminAuditLog.created_at <= until_timestamp)

    entries = session.exec(
        query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(
            limit
        )
    ).all()
    return [_to_admin_audit_log_entry(entry) for entry in entries]


@router.get(
    "/packages/stale",
    response_model=list[StalePackageInfo],
)
async def list_stale_packages(
    packages: dict[str, Package] = Depends(get_packages_cache),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
    settings: GameSettings = Depends(get_settings_cache),
) -> list[StalePackageInfo]:
    stale_after_days = settings.content_refresh.stale_after_days
    return detect_stale_packages(
        packages,
        refresh_metadata,
        stale_after_days,
        PACKAGES_DIR,
    )


@router.post(
    "/packages",
    response_model=AdminPackageSummary,
    status_code=201,
)
async def publish_admin_package(
    body: PublishPackageRequest,
    request: Request,
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
) -> AdminPackageSummary:
    try:
        raw = yaml.safe_load(body.yaml_content)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=422, detail=f"YAML parse error: {exc}") from exc

    try:
        pkg = Package.model_validate(raw)
    except ValidationError as exc:
        errors = [
            {
                "path": [str(loc) for loc in error["loc"]],
                "message": error["msg"],
            }
            for error in exc.errors()
        ]
        raise HTTPException(
            status_code=422,
            detail={"message": "Package schema validation failed", "errors": errors},
        ) from exc

    if pkg.id in packages:
        raise HTTPException(status_code=409, detail="Package id already exists")

    output_file = PACKAGES_DIR / f"{pkg.id}.yaml"
    try:
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_text(body.yaml_content, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to write package file",
        ) from exc

    packages[pkg.id] = pkg
    request.app.state.packages = packages

    now = datetime.now(tz=timezone.utc)
    existing_record = refresh_metadata.get(pkg.id)
    if existing_record is None or existing_record.added_at is None:
        refresh_metadata[pkg.id] = PackageAdminMetadataRecord(
            added_at=(existing_record.added_at or now) if existing_record else now,
            last_refreshed_at=(
                existing_record.last_refreshed_at if existing_record else None
            ),
            refreshed_at=(existing_record.refreshed_at if existing_record else None),
            previous_version=(
                existing_record.previous_version if existing_record else None
            ),
            new_version=existing_record.new_version if existing_record else None,
            diff_summary=existing_record.diff_summary if existing_record else None,
            content_hash=existing_record.content_hash if existing_record else None,
        )
        save_refresh_metadata(refresh_metadata, REFRESH_METADATA_FILE)
        request.app.state.refresh_metadata = refresh_metadata

    return build_admin_package_summary(
        pkg,
        overrides.get(pkg.id),
        refresh_metadata.get(pkg.id),
    )


@router.post("/packages/generate", response_model=GenerateResponse)
async def generate_admin_package(
    body: GenerateRequest,
    settings: GameSettings = Depends(get_settings_cache),
) -> GenerateResponse:
    try:
        yaml_content = await generate_package(
            topic=body.topic,
            audience=body.audience,
            num_pages=body.num_pages,
            num_questions=body.num_questions,
            settings=settings,
        )
    except AIGenerationError as exc:
        if exc.error_code == AI_ERROR_CODE_MISSING_API_KEY:
            raise HTTPException(
                status_code=503,
                detail=_build_ai_error_detail(exc),
            ) from exc
        raise HTTPException(
            status_code=502,
            detail=_build_ai_error_detail(exc),
        ) from exc

    return GenerateResponse(yaml_content=yaml_content)


@router.post(
    "/packages/{package_id}/refresh",
    response_model=RefreshResult,
)
async def refresh_admin_package(
    package_id: str,
    request: Request,
    dry_run: bool = False,
    packages: dict[str, Package] = Depends(get_packages_cache),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
    settings: GameSettings = Depends(get_settings_cache),
) -> RefreshResult:
    pkg = packages.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    try:
        new_yaml = await refresh_package(pkg, settings=settings)
    except AIGenerationError as exc:
        raise HTTPException(
            status_code=502,
            detail=_build_ai_error_detail(exc),
        ) from exc

    try:
        raw = yaml.safe_load(new_yaml)
        new_pkg = Package.model_validate(raw)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=422, detail=f"YAML parse error: {exc}") from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": "Schema validation failed", "errors": exc.errors()},
        ) from exc

    new_pkg_patched = new_pkg.model_copy(
        update={"id": pkg.id, "version": _bump_patch_version(pkg.version)}
    )
    diff = compute_diff_summary(pkg, new_pkg_patched)

    if dry_run:
        return RefreshResult(
            package_id=package_id,
            previous_version=pkg.version,
            new_version=new_pkg_patched.version,
            diff_summary=diff,
            dry_run=True,
        )

    now = datetime.now(tz=timezone.utc)
    try:
        _, record = write_refreshed_package(
            package_id,
            new_yaml,
            PACKAGES_DIR,
            pkg,
            refresh_metadata,
            REFRESH_METADATA_FILE,
            now,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    packages[package_id] = new_pkg_patched
    request.app.state.packages = packages
    request.app.state.refresh_metadata = refresh_metadata

    return RefreshResult(
        package_id=package_id,
        previous_version=pkg.version,
        new_version=new_pkg_patched.version,
        diff_summary=diff,
        dry_run=False,
        refreshed_at=record.refreshed_at,
    )
