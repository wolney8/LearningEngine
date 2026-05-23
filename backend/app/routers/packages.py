import yaml
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError

from app.models.package import Package, PackageSummary
from app.services.ai_generator import AIGenerationError, generate_package
from app.services.overrides_loader import PackageOverride

router = APIRouter(prefix="/packages", tags=["packages"])


class ValidateRequest(BaseModel):
    yaml_content: str


class ValidateResponse(BaseModel):
    valid: bool
    package_id: str | None = None
    errors: list[str] = Field(default_factory=list)


class GenerateRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=500)
    audience: str = Field(default="general learners", max_length=200)
    num_pages: int = Field(default=3, ge=1, le=10)
    num_questions: int = Field(default=4, ge=2, le=20)


class GenerateResponse(BaseModel):
    yaml_content: str


def get_packages_cache(request: Request) -> dict[str, Package]:
    """Dependency — extracts the package cache from app.state."""
    return request.app.state.packages


def get_package_overrides(request: Request) -> dict[str, PackageOverride]:
    """Dependency — extracts package overrides from app.state."""
    return request.app.state.package_overrides


@router.get("", response_model=list[PackageSummary])
async def list_packages(
    cache: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
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
            enabled=overrides.get(pkg.id, PackageOverride()).enabled,
            xp_threshold=overrides.get(pkg.id, PackageOverride()).xp_threshold,
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


@router.post("/generate", response_model=GenerateResponse)
async def generate_package_endpoint(body: GenerateRequest) -> GenerateResponse:
    """Generate a training package YAML using AI. Does not save to disk."""
    try:
        yaml_content = await generate_package(
            topic=body.topic,
            audience=body.audience,
            num_pages=body.num_pages,
            num_questions=body.num_questions,
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


@router.get("/{package_id}", response_model=Package)
async def get_package(
    package_id: str,
    cache: dict[str, Package] = Depends(get_packages_cache),
) -> Package:
    pkg = cache.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg
