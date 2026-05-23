from __future__ import annotations

import hmac
import os
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.package import Package, PackageSummary
from app.models.settings import GameSettings
from app.services.overrides_loader import (
    OVERRIDES_FILE,
    PackageOverride,
    derive_enabled_from_availability,
    resolve_effective_availability,
    save_package_overrides,
)
from app.services.settings_loader import SETTINGS_FILE, save_settings

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
    return request.app.state.settings


def get_packages_cache(request: Request) -> dict[str, Package]:
    return request.app.state.packages


def get_package_overrides(request: Request) -> dict[str, PackageOverride]:
    return request.app.state.package_overrides


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
