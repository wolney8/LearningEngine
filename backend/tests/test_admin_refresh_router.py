from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import yaml
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.package import Package
from app.models.refresh import PackageAdminMetadataRecord
from app.models.settings import GameSettings
from app.models.user import User
from app.routers.admin import (
    get_packages_cache,
    get_refresh_metadata_cache,
    get_settings_cache,
)
from app.routers.users import require_admin_user
from app.services import ai_generator
from app.services.ai_generator import AIGenerationError


def _sample_settings(stale_after_days: int = 90) -> GameSettings:
    return GameSettings.model_validate(
        {
            "version": 1,
            "xp": {
                "lesson_base_xp_per_correct": 10,
                "first_completion_bonus": 20,
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
            "content_refresh": {"stale_after_days": stale_after_days},
        }
    )


def _sample_package() -> Package:
    return Package.model_validate(
        {
            "id": "sample-demo",
            "title": "Sample Demo Package",
            "description": "A demo package for refresh testing.",
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


def _refreshed_yaml() -> str:
    return """
id: generated-different-id
title: Refreshed Sample Demo
description: Refreshed content
version: 1.0.0
tags:
  - demo
passing_score: 0.75
pages:
  - id: p1
    title: Updated Page 1
    content: Updated content body
questions:
  - id: q1
    text: Updated question?
    answers:
      - id: a
        text: "Yes"
      - id: b
        text: "No"
    correct_answer: a
    weight: 100.0
    feedback: Updated feedback
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


def _clear_admin_override() -> None:
    app.dependency_overrides.pop(require_admin_user, None)


async def test_stale_list_requires_authentication() -> None:
    _clear_admin_override()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/admin/packages/stale")

    _install_admin_override()

    assert response.status_code == 401


async def test_stale_list_returns_empty_when_no_stale_packages(tmp_path) -> None:
    _install_admin_override()

    pkg = _sample_package()
    package_file = tmp_path / f"{pkg.id}.yaml"
    package_file.write_text(_refreshed_yaml(), encoding="utf-8")

    from app.routers import admin as admin_router

    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.PACKAGES_DIR = tmp_path

    app.dependency_overrides[get_packages_cache] = lambda: {pkg.id: pkg}
    app.dependency_overrides[get_refresh_metadata_cache] = lambda: {}
    app.dependency_overrides[get_settings_cache] = lambda: _sample_settings(90)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/admin/packages/stale"
        )

    app.dependency_overrides.clear()
    admin_router.PACKAGES_DIR = original_packages_dir

    assert response.status_code == 200
    assert response.json() == []


async def test_stale_list_returns_stale_packages() -> None:
    _install_admin_override()

    pkg = _sample_package()
    stale_metadata = {
        pkg.id: PackageAdminMetadataRecord(
            last_refreshed_at=datetime.now(tz=timezone.utc) - timedelta(days=100),
            previous_version="1.0.0",
            new_version="1.0.1",
            diff_summary="updated",
            content_hash="abc",
        )
    }

    app.dependency_overrides[get_packages_cache] = lambda: {pkg.id: pkg}
    app.dependency_overrides[get_refresh_metadata_cache] = lambda: stale_metadata
    app.dependency_overrides[get_settings_cache] = lambda: _sample_settings(90)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/admin/packages/stale"
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == pkg.id


async def test_refresh_requires_authentication() -> None:
    _clear_admin_override()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/admin/packages/sample-demo/refresh")

    _install_admin_override()

    assert response.status_code == 401


async def test_refresh_404_for_unknown_package() -> None:
    _install_admin_override()

    app.dependency_overrides[get_packages_cache] = lambda: {}
    app.dependency_overrides[get_refresh_metadata_cache] = lambda: {}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/packages/missing/refresh",
        )

    app.dependency_overrides.clear()

    assert response.status_code == 404


async def test_refresh_dry_run_no_disk_write(monkeypatch) -> None:
    _install_admin_override()

    pkg = _sample_package()

    async def fake_refresh_package(
        existing: Package, settings: GameSettings | None = None
    ) -> str:
        assert existing.id == pkg.id
        assert settings is not None
        return _refreshed_yaml()

    def fail_if_called(*args, **kwargs):
        raise AssertionError("write_refreshed_package should not be called for dry_run")

    from app.routers import admin as admin_router

    monkeypatch.setattr(admin_router, "refresh_package", fake_refresh_package)
    monkeypatch.setattr(admin_router, "write_refreshed_package", fail_if_called)

    app.dependency_overrides[get_packages_cache] = lambda: {pkg.id: pkg}
    app.dependency_overrides[get_refresh_metadata_cache] = lambda: {}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            f"/admin/packages/{pkg.id}/refresh?dry_run=true",
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["dry_run"] is True
    assert body["package_id"] == pkg.id
    assert body["refreshed_at"] is None


async def test_refresh_validation_failure_returns_422(monkeypatch) -> None:
    _install_admin_override()

    pkg = _sample_package()

    async def fake_refresh_package(
        existing: Package, settings: GameSettings | None = None
    ) -> str:
        assert existing.id == pkg.id
        assert settings is not None
        return "id: bad: yaml"

    from app.routers import admin as admin_router

    monkeypatch.setattr(admin_router, "refresh_package", fake_refresh_package)

    app.dependency_overrides[get_packages_cache] = lambda: {pkg.id: pkg}
    app.dependency_overrides[get_refresh_metadata_cache] = lambda: {}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            f"/admin/packages/{pkg.id}/refresh",
        )

    app.dependency_overrides.clear()

    assert response.status_code == 422


async def test_refresh_ai_error_returns_502(monkeypatch) -> None:
    _install_admin_override()

    pkg = _sample_package()

    async def fake_refresh_package(
        existing: Package, settings: GameSettings | None = None
    ) -> str:
        assert existing.id == pkg.id
        assert settings is not None
        raise AIGenerationError("Gemini API call failed: boom")

    from app.routers import admin as admin_router

    monkeypatch.setattr(admin_router, "refresh_package", fake_refresh_package)

    app.dependency_overrides[get_packages_cache] = lambda: {pkg.id: pkg}
    app.dependency_overrides[get_refresh_metadata_cache] = lambda: {}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            f"/admin/packages/{pkg.id}/refresh",
        )

    app.dependency_overrides.clear()

    assert response.status_code == 502


async def test_refresh_updates_last_refreshed_metadata(monkeypatch, tmp_path) -> None:
    _install_admin_override()

    pkg = _sample_package()

    async def fake_refresh_package(
        existing: Package, settings: GameSettings | None = None
    ) -> str:
        assert existing.id == pkg.id
        assert settings is not None
        return _refreshed_yaml()

    from app.routers import admin as admin_router

    monkeypatch.setattr(admin_router, "refresh_package", fake_refresh_package)

    original_packages_dir = admin_router.PACKAGES_DIR
    original_metadata_file = admin_router.REFRESH_METADATA_FILE
    admin_router.PACKAGES_DIR = tmp_path
    admin_router.REFRESH_METADATA_FILE = tmp_path / "package-refresh-metadata.yaml"

    (tmp_path / f"{pkg.id}.yaml").write_text(_refreshed_yaml(), encoding="utf-8")
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = {
        pkg.id: PackageAdminMetadataRecord(
            added_at=datetime.now(tz=timezone.utc) - timedelta(days=20)
        )
    }

    app.dependency_overrides[get_packages_cache] = lambda: {pkg.id: pkg}
    app.dependency_overrides[get_refresh_metadata_cache] = lambda: refresh_metadata
    app.dependency_overrides[get_settings_cache] = lambda: _sample_settings(90)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(f"/admin/packages/{pkg.id}/refresh")

    app.dependency_overrides.clear()
    admin_router.PACKAGES_DIR = original_packages_dir
    admin_router.REFRESH_METADATA_FILE = original_metadata_file

    assert response.status_code == 200
    assert refresh_metadata[pkg.id].last_refreshed_at is not None


async def test_ai_generate_package_applies_fallback_tags_when_empty(
    monkeypatch,
) -> None:
    generated = _sample_package().model_copy(update={"tags": []})

    class FakeAgent:
        async def run(self, prompt: str):
            return SimpleNamespace(output=generated)

    monkeypatch.setattr(ai_generator, "_get_agent", lambda **kwargs: FakeAgent())

    yaml_content = await ai_generator.generate_package(
        topic="Cyber Security Essentials",
        audience="New Employees",
        num_pages=1,
        num_questions=1,
        settings=None,
    )

    raw = yaml.safe_load(yaml_content)
    assert raw["tags"] == [
        "cyber-security-essentials",
        "audience-new-employees",
        "ai-generated",
    ]


async def test_ai_refresh_preserves_existing_tags_when_generated_tags_empty(
    monkeypatch,
) -> None:
    existing = _sample_package().model_copy(update={"tags": ["existing", "Focus"]})
    refreshed = _sample_package().model_copy(update={"tags": ["", " "]})

    class FakeAgent:
        async def run(self, prompt: str):
            return SimpleNamespace(output=refreshed)

    monkeypatch.setattr(ai_generator, "_get_agent", lambda **kwargs: FakeAgent())

    yaml_content = await ai_generator.refresh_package(existing, settings=None)

    raw = yaml.safe_load(yaml_content)
    assert raw["tags"] == ["existing", "Focus"]
