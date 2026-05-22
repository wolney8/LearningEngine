import yaml
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError

from app.models.package import Package, PackageSummary

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


@router.get("", response_model=list[PackageSummary])
async def list_packages(
    cache: dict[str, Package] = Depends(get_packages_cache),
) -> list[PackageSummary]:
    return [
        PackageSummary(
            id=pkg.id,
            title=pkg.title,
            description=pkg.description,
            version=pkg.version,
            tags=pkg.tags,
            passing_score=pkg.passing_score,
            page_count=len(pkg.pages),
            question_count=len(pkg.questions),
        )
        for pkg in cache.values()
    ]


@router.post("/validate", response_model=ValidateResponse)
async def validate_package(body: ValidateRequest) -> ValidateResponse:
    try:
        raw = yaml.safe_load(body.yaml_content)
    except yaml.YAMLError as exc:
        return ValidateResponse(valid=False, errors=[f"YAML parse error: {exc}"])

    try:
        pkg = Package.model_validate(raw)
        return ValidateResponse(valid=True, package_id=pkg.id)
    except ValidationError as exc:
        errors = [
            f"{' -> '.join(str(loc) for loc in error['loc'])}: {error['msg']}"
            for error in exc.errors()
        ]
        return ValidateResponse(valid=False, errors=errors)


@router.get("/{package_id}", response_model=Package)
async def get_package(
    package_id: str,
    cache: dict[str, Package] = Depends(get_packages_cache),
) -> Package:
    pkg = cache.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg
