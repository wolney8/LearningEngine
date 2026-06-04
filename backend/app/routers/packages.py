from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.models.package import Package, PackageSummary
from app.services.overrides_loader import (
    PackageOverride,
    derive_enabled_from_availability,
    resolve_effective_availability,
)
from app.services.package_import import (
    format_package_import_issue,
    validate_package_yaml_content,
)

router = APIRouter(prefix="/packages", tags=["packages"])


class ValidateRequest(BaseModel):
    yaml_content: str


class ValidateResponse(BaseModel):
    valid: bool
    package_id: str | None = None
    errors: list[str] = Field(default_factory=list)


def get_packages_cache(request: Request) -> dict[str, Package]:
    """Dependency — extracts the package cache from app.state."""
    return request.app.state.packages


def get_package_overrides(request: Request) -> dict[str, PackageOverride]:
    """Dependency — extracts package overrides from app.state."""
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


def list_visible_package_summaries(
    cache: dict[str, Package],
    overrides: dict[str, PackageOverride],
) -> list[PackageSummary]:
    items: list[PackageSummary] = []
    for pkg in cache.values():
        override = overrides.get(pkg.id)
        availability = resolve_effective_availability(override)
        if availability == "hidden":
            continue
        items.append(build_package_summary(pkg, override))
    return items


@router.get("", response_model=list[PackageSummary])
async def list_packages(
    cache: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> list[PackageSummary]:
    return list_visible_package_summaries(cache, overrides)


@router.post("/validate", response_model=ValidateResponse)
async def validate_package(body: ValidateRequest) -> ValidateResponse:
    result = validate_package_yaml_content(body.yaml_content)
    if result.valid and result.package is not None:
        return ValidateResponse(valid=True, package_id=result.package.id)
    return ValidateResponse(
        valid=False,
        errors=[format_package_import_issue(issue) for issue in result.issues],
    )


@router.get("/{package_id}", response_model=Package)
async def get_package(
    package_id: str,
    cache: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> Package:
    pkg = cache.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    availability = resolve_effective_availability(overrides.get(package_id))
    if availability == "hidden":
        raise HTTPException(status_code=404, detail="Package not found")
    if availability == "unavailable":
        raise HTTPException(status_code=403, detail="Package is unavailable")

    return pkg
