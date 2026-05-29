from __future__ import annotations

import hmac
import os
from datetime import datetime, timezone
from typing import Any, Literal

import yaml
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.models.package import Package, PackageSummary
from app.models.refresh import PackageRefreshRecord, RefreshResult, StalePackageInfo
from app.models.settings import GameSettings
from app.services.ai_generator import (
    AIGenerationError,
    refresh_package,
    test_connection,
)
from app.services.overrides_loader import (
    OVERRIDES_FILE,
    PackageOverride,
    derive_enabled_from_availability,
    resolve_effective_availability,
    save_package_overrides,
)
from app.services.package_loader import PACKAGES_DIR
from app.services.refresh_metadata_loader import REFRESH_METADATA_FILE
from app.services.refresh_service import (
    _bump_patch_version,
    compute_diff_summary,
    detect_stale_packages,
    write_refreshed_package,
)
from app.services.settings_loader import SETTINGS_FILE, load_settings, save_settings

router = APIRouter(prefix="/admin", tags=["admin"])


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


def require_admin_token(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    expected_token = os.getenv("ADMIN_TOKEN")
    if not expected_token:
        raise HTTPException(
            status_code=503,
            detail="Admin API not configured. Set ADMIN_TOKEN in the environment.",
        )

    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected_token):
        raise HTTPException(status_code=401, detail="Invalid admin token")


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


def get_refresh_metadata_cache(request: Request) -> dict[str, PackageRefreshRecord]:
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


def build_ai_config_response(settings: GameSettings) -> AdminAIConfigResponse:
    return AdminAIConfigResponse(
        provider=settings.ai.provider,
        model=settings.ai.model,
        key_present=bool(os.getenv("GEMINI_API_KEY")),
    )


@router.get(
    "/settings",
    response_model=GameSettings,
    dependencies=[Depends(require_admin_token)],
)
async def read_admin_settings(
    settings: GameSettings = Depends(get_settings_cache),
) -> GameSettings:
    return settings


@router.put(
    "/settings",
    response_model=GameSettings,
    dependencies=[Depends(require_admin_token)],
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
    dependencies=[Depends(require_admin_token)],
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
    dependencies=[Depends(require_admin_token)],
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
    dependencies=[Depends(require_admin_token)],
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
    dependencies=[Depends(require_admin_token)],
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
    response_model=list[PackageSummary],
    dependencies=[Depends(require_admin_token)],
)
async def list_admin_packages(
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> list[PackageSummary]:
    return [
        build_package_summary(pkg, overrides.get(pkg.id))
        for pkg in packages.values()
    ]


@router.patch(
    "/packages/{package_id}",
    response_model=PackageSummary,
    dependencies=[Depends(require_admin_token)],
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
    dependencies=[Depends(require_admin_token)],
)
async def list_stale_packages(
    packages: dict[str, Package] = Depends(get_packages_cache),
    refresh_metadata: dict[str, PackageRefreshRecord] = Depends(
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
    response_model=PackageSummary,
    status_code=201,
    dependencies=[Depends(require_admin_token)],
)
async def publish_admin_package(
    body: PublishPackageRequest,
    request: Request,
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> PackageSummary:
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

    return build_package_summary(pkg, overrides.get(pkg.id))


@router.post(
    "/packages/{package_id}/refresh",
    response_model=RefreshResult,
    dependencies=[Depends(require_admin_token)],
)
async def refresh_admin_package(
    package_id: str,
    request: Request,
    dry_run: bool = False,
    packages: dict[str, Package] = Depends(get_packages_cache),
    refresh_metadata: dict[str, PackageRefreshRecord] = Depends(
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
