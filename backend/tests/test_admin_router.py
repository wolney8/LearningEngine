from __future__ import annotations

import os
from pathlib import Path

import yaml
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.package import Package
from app.models.settings import GameSettings
from app.routers.admin import (
    get_package_overrides,
    get_packages_cache,
    get_settings_cache,
)
from app.services.overrides_loader import PackageOverride


def _sample_settings(first_completion_bonus: int = 20) -> GameSettings:
    return GameSettings.model_validate(
        {
            "version": 1,
            "xp": {
                "lesson_base_xp_per_correct": 10,
                "first_completion_bonus": first_completion_bonus,
                "attempt_multipliers": {"1": 1.0, "2": 0.5, "3": 0.25},
                "hard_expert_exit_penalty": 50,
                "hard_expert_low_answer_penalty": 50,
                "min_correct_for_xp": {
                    "easy": 2,
                    "normal": 2,
                    "hard": 0,
                    "expert": 0,
                },
            },
            "difficulty": {
                "seconds_per_question": {
                    "easy": 90,
                    "normal": 45,
                    "hard": 20,
                    "expert": 10,
                },
                "xp_multiplier": {
                    "easy": 0.5,
                    "normal": 1.0,
                    "hard": 1.5,
                    "expert": 2.0,
                },
            },
        }
    )


def _sample_package() -> Package:
    return Package.model_validate(
        {
            "id": "sample-demo",
            "title": "Sample Demo Package",
            "description": "A demo package for admin testing.",
            "version": "1.0.0",
            "tags": ["demo"],
            "passing_score": 0.75,
            "pages": [{"id": "p1", "title": "Page 1", "content": "Content"}],
            "questions": [
                {
                    "id": "q1",
                    "text": "Question?",
                    "answers": [
                        {"id": "a", "text": "Yes"},
                        {"id": "b", "text": "No"},
                    ],
                    "correct_answer": "a",
                    "weight": 100.0,
                    "feedback": "Correct.",
                    "revision_page_ids": ["p1"],
                }
            ],
        }
    )


async def test_admin_settings_rejects_invalid_token() -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/admin/settings", headers={"X-Admin-Token": "bad"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid admin token"


async def test_admin_settings_get_and_put_roundtrip(tmp_path: Path) -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    settings_cache = _sample_settings()
    app.dependency_overrides[get_settings_cache] = lambda: settings_cache

    from app.routers import admin as admin_router

    original_settings_file = admin_router.SETTINGS_FILE
    admin_router.SETTINGS_FILE = tmp_path / "settings.yaml"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        get_response = await client.get(
            "/admin/settings", headers={"X-Admin-Token": "secret-token"}
        )
        assert get_response.status_code == 200
        assert get_response.json()["xp"]["first_completion_bonus"] == 20

        payload = _sample_settings(first_completion_bonus=77).model_dump(mode="json")
        put_response = await client.put(
            "/admin/settings",
            headers={"X-Admin-Token": "secret-token"},
            json=payload,
        )

    app.dependency_overrides.clear()
    admin_router.SETTINGS_FILE = original_settings_file

    assert put_response.status_code == 200
    assert put_response.json()["xp"]["first_completion_bonus"] == 77

    saved = yaml.safe_load((tmp_path / "settings.yaml").read_text(encoding="utf-8"))
    assert saved["xp"]["first_completion_bonus"] == 77


async def test_admin_package_patch_persists_override_and_merges_public_list(
    tmp_path: Path,
) -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    pkg = _sample_package()
    packages_cache = {pkg.id: pkg}
    overrides_cache: dict[str, PackageOverride] = {}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    app.state.packages = packages_cache
    app.state.package_overrides = overrides_cache

    from app.routers import admin as admin_router

    original_overrides_file = admin_router.OVERRIDES_FILE
    admin_router.OVERRIDES_FILE = tmp_path / "package-overrides.yaml"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        patch_response = await client.patch(
            f"/admin/packages/{pkg.id}",
            headers={"X-Admin-Token": "secret-token"},
            json={"enabled": False, "xp_threshold": 250},
        )

        public_response = await client.get("/packages")

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file

    assert patch_response.status_code == 200
    assert patch_response.json()["enabled"] is False
    assert patch_response.json()["xp_threshold"] == 250

    public_item = public_response.json()[0]
    assert public_item["enabled"] is False
    assert public_item["xp_threshold"] == 250

    saved = yaml.safe_load(
        (tmp_path / "package-overrides.yaml").read_text(encoding="utf-8")
    )
    assert saved["packages"][pkg.id]["enabled"] is False
    assert saved["packages"][pkg.id]["xp_threshold"] == 250
