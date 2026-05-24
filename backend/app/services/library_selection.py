from __future__ import annotations

from fastapi import HTTPException, status

from app.models.package import Package
from app.services.overrides_loader import (
    PackageOverride,
    resolve_effective_availability,
)


def normalise_package_id(raw_package_id: str) -> str:
    package_id = raw_package_id.strip()
    if not package_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="package_id must not be empty",
        )
    return package_id


def build_selectable_package_id_universe(
    cache: dict[str, Package],
    overrides: dict[str, PackageOverride],
) -> set[str]:
    selectable_ids: set[str] = set()
    for pkg_id in cache:
        availability = resolve_effective_availability(overrides.get(pkg_id))
        if availability != "hidden":
            selectable_ids.add(pkg_id)
    return selectable_ids


def validate_selectable_package_ids(
    package_ids: list[str],
    cache: dict[str, Package],
    overrides: dict[str, PackageOverride],
    *,
    detail_field: str,
) -> list[str]:
    selectable_ids = build_selectable_package_id_universe(cache, overrides)
    invalid_package_ids = [
        package_id for package_id in package_ids if package_id not in selectable_ids
    ]
    if invalid_package_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "message": (
                    f"{detail_field} contains unknown or hidden package ids"
                ),
                "invalid_package_ids": invalid_package_ids,
            },
        )
    return package_ids
