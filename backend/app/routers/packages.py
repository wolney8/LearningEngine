from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.package import Package, PackageSummary

router = APIRouter(prefix="/packages", tags=["packages"])


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


@router.get("/{package_id}", response_model=Package)
async def get_package(
    package_id: str,
    cache: dict[str, Package] = Depends(get_packages_cache),
) -> Package:
    pkg = cache.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg
