from __future__ import annotations

import os
from pathlib import Path

import yaml
from httpx import ASGITransport, AsyncClient
from fastapi import HTTPException

from app.main import app
from app.models.package import Package
from app.models.user import User
from app.models.settings import GameSettings
from app.routers.admin import (
    get_package_overrides,
    get_packages_cache,
    get_settings_cache,
)
from app.routers.users import require_admin_user
from app.services.overrides_loader import PackageOverride


def _sample_settings(first_completion_bonus: int = 20) -> GameSettings:
    return GameSettings.model_validate(
        {
            "version": 1,
            "xp": {
                "lesson_base_xp_per_correct": 10,
                "base_xp_per_level": 500,
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



def _publish_yaml_content(package_id: str = "new-package") -> str:
    return f"""
id: {package_id}
title: New Package
description: Created from admin publish endpoint.
version: 1.0.0
tags:
  - demo
passing_score: 0.8
pages:
  - id: p1
    title: Page 1
    content: Body
questions:
  - id: q1
    text: Question?
    answers:
      - id: a
        text: "Yes"
      - id: b
        text: "No"
    correct_answer: a
    weight: 100.0
    feedback: Correct
    revision_page_ids:
      - p1
""".strip()


def _admin_user() -> User:
    return User(
        id=1,
        username="admin",
        email="admin@example.com",
        hashed_password="x",
        role="admin",
    )


def _install_admin_override() -> None:
    app.dependency_overrides[require_admin_user] = _admin_user
    if not hasattr(app.state, "refresh_metadata"):
        app.state.refresh_metadata = {}


def _clear_admin_override() -> None:
    app.dependency_overrides.pop(require_admin_user, None)


async def test_require_admin_user_rejects_non_admin_role() -> None:
    student = User(
        id=2,
        username="student",
        email="student@example.com",
        hashed_password="x",
        role="student",
    )

    try:
        require_admin_user(student)
        assert False, "Expected admin role guard to reject non-admin user"
    except HTTPException as exc:
        assert exc.status_code == 403
        assert exc.detail == "Admin access required"


async def test_admin_settings_rejects_unauthenticated_requests() -> None:
    _clear_admin_override()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/admin/settings")

    _install_admin_override()

    assert response.status_code == 401

async def test_admin_settings_get_and_put_roundtrip(tmp_path: Path) -> None:
    _install_admin_override()

    settings_cache = _sample_settings()
    app.dependency_overrides[get_settings_cache] = lambda: settings_cache

    from app.routers import admin as admin_router

    original_settings_file = admin_router.SETTINGS_FILE
    admin_router.SETTINGS_FILE = tmp_path / "settings.yaml"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        get_response = await client.get(
            "/admin/settings"
        )
        assert get_response.status_code == 200
        assert get_response.json()["xp"]["first_completion_bonus"] == 20
        assert get_response.json()["xp"]["base_xp_per_level"] == 500

        payload = _sample_settings(first_completion_bonus=77).model_dump(mode="json")
        put_response = await client.put(
            "/admin/settings",
            json=payload,
        )

    app.dependency_overrides.clear()
    admin_router.SETTINGS_FILE = original_settings_file

    assert put_response.status_code == 200
    assert put_response.json()["xp"]["first_completion_bonus"] == 77
    assert put_response.json()["xp"]["base_xp_per_level"] == 500

    saved = yaml.safe_load((tmp_path / "settings.yaml").read_text(encoding="utf-8"))
    assert saved["xp"]["first_completion_bonus"] == 77
    assert saved["xp"]["base_xp_per_level"] == 500


async def test_admin_package_patch_persists_override_and_merges_public_list(
    tmp_path: Path,
) -> None:
    _install_admin_override()

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
            json={"availability": "unavailable", "xp_threshold": 250},
        )

        public_response = await client.get("/packages")

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file

    assert patch_response.status_code == 200
    assert patch_response.json()["availability"] == "unavailable"
    assert patch_response.json()["enabled"] is False
    assert patch_response.json()["xp_threshold"] == 250

    public_item = public_response.json()[0]
    assert public_item["availability"] == "unavailable"
    assert public_item["enabled"] is False
    assert public_item["xp_threshold"] == 250

    saved = yaml.safe_load(
        (tmp_path / "package-overrides.yaml").read_text(encoding="utf-8")
    )
    assert saved["packages"][pkg.id]["availability"] == "unavailable"
    assert saved["packages"][pkg.id]["xp_threshold"] == 250


async def test_admin_patch_enabled_false_maps_to_unavailable(tmp_path: Path) -> None:
    _install_admin_override()

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
            json={"enabled": False},
        )

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file

    assert patch_response.status_code == 200
    assert patch_response.json()["availability"] == "unavailable"
    assert patch_response.json()["enabled"] is False


async def test_admin_patch_availability_overrides_enabled_if_both_sent(
    tmp_path: Path,
) -> None:
    _install_admin_override()

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
            json={"availability": "hidden", "enabled": True},
        )

        public_response = await client.get("/packages")
        admin_response = await client.get(
            "/admin/packages"
        )

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file

    assert patch_response.status_code == 200
    assert patch_response.json()["availability"] == "hidden"
    assert patch_response.json()["enabled"] is False

    assert public_response.status_code == 200
    assert public_response.json() == []

    assert admin_response.status_code == 200
    assert admin_response.json()[0]["availability"] == "hidden"


async def test_admin_publish_package_requires_authentication() -> None:
    _clear_admin_override()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/packages",
            json={"yaml_content": _publish_yaml_content()},
        )

    assert response.status_code == 401
    _install_admin_override()


async def test_admin_publish_package_rejects_invalid_yaml(tmp_path: Path) -> None:
    _install_admin_override()

    packages_cache: dict[str, Package] = {}
    overrides_cache: dict[str, PackageOverride] = {}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    from app.routers import admin as admin_router

    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.PACKAGES_DIR = tmp_path

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/packages",
            json={"yaml_content": "id: bad: yaml"},
        )

    app.dependency_overrides.clear()
    admin_router.PACKAGES_DIR = original_packages_dir

    assert response.status_code == 422
    assert "YAML parse error" in response.json()["detail"]


async def test_admin_publish_package_rejects_schema_validation_error(
    tmp_path: Path,
) -> None:
    _install_admin_override()

    packages_cache: dict[str, Package] = {}
    overrides_cache: dict[str, PackageOverride] = {}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    from app.routers import admin as admin_router

    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.PACKAGES_DIR = tmp_path

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/packages",
            json={"yaml_content": "id: only-id"},
        )

    app.dependency_overrides.clear()
    admin_router.PACKAGES_DIR = original_packages_dir

    assert response.status_code == 422
    assert response.json()["detail"]["message"] == "Package schema validation failed"
    assert len(response.json()["detail"]["errors"]) > 0


async def test_admin_publish_package_rejects_duplicate_id(tmp_path: Path) -> None:
    _install_admin_override()

    existing = _sample_package()
    packages_cache = {existing.id: existing}
    overrides_cache: dict[str, PackageOverride] = {}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    from app.routers import admin as admin_router

    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.PACKAGES_DIR = tmp_path

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/packages",
            json={"yaml_content": _publish_yaml_content(existing.id)},
        )

    app.dependency_overrides.clear()
    admin_router.PACKAGES_DIR = original_packages_dir

    assert response.status_code == 409
    assert response.json()["detail"] == "Package id already exists"


async def test_admin_publish_package_success_updates_cache_and_writes_file(
    tmp_path: Path,
) -> None:
    _install_admin_override()

    packages_cache: dict[str, Package] = {}
    overrides_cache: dict[str, PackageOverride] = {}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    app.state.packages = packages_cache
    app.state.package_overrides = overrides_cache

    from app.routers import admin as admin_router

    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.PACKAGES_DIR = tmp_path

    yaml_content = _publish_yaml_content("published-demo")

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/packages",
            json={"yaml_content": yaml_content},
        )

    app.dependency_overrides.clear()
    admin_router.PACKAGES_DIR = original_packages_dir

    assert response.status_code == 201
    assert response.json()["id"] == "published-demo"
    assert response.json()["page_count"] == 1
    assert response.json()["question_count"] == 1
    assert response.json()["added_at"] is not None
    assert response.json()["last_refreshed_at"] is None

    assert "published-demo" in app.state.packages
    assert (tmp_path / "published-demo.yaml").exists()
    # end of file


async def test_admin_generate_package_requires_authentication() -> None:
    _clear_admin_override()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/packages/generate",
            json={
                "topic": "Cyber awareness",
                "audience": "new employees",
                "num_pages": 2,
                "num_questions": 3,
            },
        )

    _install_admin_override()

    assert response.status_code == 401


async def test_admin_generate_package_success(monkeypatch) -> None:
    _install_admin_override()

    sample_yaml = _publish_yaml_content("generated-admin")

    async def fake_generate_package(**kwargs):
        return sample_yaml

    from app.routers import admin as admin_router

    monkeypatch.setattr(admin_router, "generate_package", fake_generate_package)
    app.dependency_overrides[get_settings_cache] = lambda: _sample_settings()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/packages/generate",
            json={
                "topic": "Cyber awareness",
                "audience": "new employees",
                "num_pages": 2,
                "num_questions": 3,
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["yaml_content"] == sample_yaml


async def test_admin_ai_config_rejects_invalid_token() -> None:
    _clear_admin_override()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/admin/ai-config")

    _install_admin_override()

    assert response.status_code == 401


async def test_admin_ai_config_get_and_update_roundtrip(tmp_path: Path) -> None:
    _install_admin_override()
    os.environ["GEMINI_API_KEY"] = "secret-test-key"

    settings_cache = _sample_settings()
    app.dependency_overrides[get_settings_cache] = lambda: settings_cache

    from app.routers import admin as admin_router

    original_settings_file = admin_router.SETTINGS_FILE
    admin_router.SETTINGS_FILE = tmp_path / "settings.yaml"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        get_response = await client.get(
            "/admin/ai-config"
        )
        assert get_response.status_code == 200
        assert get_response.json() == {
            "provider": "gemini",
            "model": "gemini-2.0-flash-exp",
            "key_present": True,
        }

        put_response = await client.put(
            "/admin/ai-config",
            json={"provider": "gemini", "model": "gemini-2.5-flash"},
        )

    app.dependency_overrides.clear()
    admin_router.SETTINGS_FILE = original_settings_file

    assert put_response.status_code == 200
    assert put_response.json() == {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "key_present": True,
    }

    saved = yaml.safe_load((tmp_path / "settings.yaml").read_text(encoding="utf-8"))
    assert saved["ai"] == {"provider": "gemini", "model": "gemini-2.5-flash"}
    assert "api_key" not in saved.get("ai", {})


async def test_admin_ai_connection_test_uses_write_only_key(
    monkeypatch,
) -> None:
    _install_admin_override()

    settings_cache = _sample_settings()
    app.dependency_overrides[get_settings_cache] = lambda: settings_cache

    from app.routers import admin as admin_router

    observed: dict[str, object] = {}

    async def fake_test_connection(
        *,
        settings: GameSettings,
        api_key: str,
        provider_override: str | None,
        model_override: str | None,
    ) -> None:
        observed["provider"] = provider_override
        observed["model"] = model_override
        observed["api_key"] = api_key
        observed["settings_model"] = settings.ai.model

    monkeypatch.setattr(admin_router, "test_connection", fake_test_connection)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/ai-config/test",
            json={
                "api_key": "super-secret",
                "provider": "gemini",
                "model": "gemini-2.5-flash",
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "message": "Connection test succeeded.",
    }
    assert observed == {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "api_key": "super-secret",
        "settings_model": "gemini-2.0-flash-exp",
    }
    assert "api_key" not in response.text


async def test_admin_ai_connection_test_failure_redacts_details(
    monkeypatch,
) -> None:
    _install_admin_override()

    settings_cache = _sample_settings()
    app.dependency_overrides[get_settings_cache] = lambda: settings_cache

    from app.routers import admin as admin_router

    async def fake_test_connection(**kwargs) -> None:
        raise admin_router.AIGenerationError("raw provider error with token")

    monkeypatch.setattr(admin_router, "test_connection", fake_test_connection)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/ai-config/test",
            json={"api_key": "super-secret"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "success": False,
        "message": "Connection test failed. Check provider, model, and API key.",
    }
    assert "super-secret" not in response.text
