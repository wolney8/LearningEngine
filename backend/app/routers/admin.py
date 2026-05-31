from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Literal

import yaml
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlmodel import Session, select

from app.models.package import AdminPackageSummary, Package, PackageSummary
from app.models.refresh import (
    PackageAdminMetadataRecord,
    RefreshResult,
    StalePackageInfo,
)
from app.models.settings import GameSettings
from app.models.user import User
from app.routers.users import require_admin_user
from app.services.ai_generator import (
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
    num_questions: int = Field(default=4, ge=2, le=20)


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


class AdminUserSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    email: str
    role: Literal["student", "admin"]
    created_at: datetime


class AdminUserRoleUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["student", "admin"]


def to_admin_user_summary(user: User) -> AdminUserSummary:
    return AdminUserSummary(
        id=user.id or 0,
        username=user.username,
        email=user.email,
        role=user.role,
        created_at=user.created_at,
    )


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
) -> GameSettings:
    save_settings(body, SETTINGS_FILE)
    request.app.state.settings = body
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
    try:
        await test_connection(
            settings=settings,
            api_key=body.api_key,
            provider_override=body.provider,
            model_override=body.model,
        )
    except AIGenerationError:
        return AdminAIConnectionTestResponse(
            success=False,
            message="Connection test failed. Check provider, model, and API key.",
        )

    return AdminAIConnectionTestResponse(
        success=True,
        message="Connection test succeeded.",
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
    session: Session = Depends(get_session),
) -> AdminUserSummary:
    user = session.exec(select(User).where(User.id == user_id)).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

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
    session.commit()
    session.refresh(user)
    return to_admin_user_summary(user)


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

    return build_package_summary(pkg, updated_override)


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
        if "GEMINI_API_KEY is not set" in str(exc):
            raise HTTPException(
                status_code=503,
                detail="AI service not configured. Set GEMINI_API_KEY in backend/.env",
            ) from exc
        raise HTTPException(
            status_code=502,
            detail=f"AI generation failed: {exc}",
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
        raise HTTPException(status_code=502, detail=str(exc)) from exc

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
