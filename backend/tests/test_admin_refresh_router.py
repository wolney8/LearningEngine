from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.package import Package
from app.models.refresh import PackageRefreshRecord
from app.models.settings import GameSettings
from app.routers.admin import (
    get_packages_cache,
    get_refresh_metadata_cache,
    get_settings_cache,
)
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


async def test_stale_list_rejects_invalid_token() -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/admin/packages/stale")

    assert response.status_code == 401


async def test_stale_list_returns_empty_when_no_stale_packages(tmp_path) -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

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
            "/admin/packages/stale", headers={"X-Admin-Token": "secret-token"}
        )

    app.dependency_overrides.clear()
    admin_router.PACKAGES_DIR = original_packages_dir

    assert response.status_code == 200
    assert response.json() == []


async def test_stale_list_returns_stale_packages() -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    pkg = _sample_package()
    stale_metadata = {
        pkg.id: PackageRefreshRecord(
            refreshed_at=datetime.now(tz=timezone.utc) - timedelta(days=100),
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
            "/admin/packages/stale", headers={"X-Admin-Token": "secret-token"}
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == pkg.id


async def test_refresh_rejects_invalid_token() -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/admin/packages/sample-demo/refresh")

    assert response.status_code == 401


async def test_refresh_404_for_unknown_package() -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    app.dependency_overrides[get_packages_cache] = lambda: {}
    app.dependency_overrides[get_refresh_metadata_cache] = lambda: {}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/admin/packages/missing/refresh",
            headers={"X-Admin-Token": "secret-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 404


async def test_refresh_dry_run_no_disk_write(monkeypatch) -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    pkg = _sample_package()

    async def fake_refresh_package(existing: Package) -> str:
        assert existing.id == pkg.id
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
            headers={"X-Admin-Token": "secret-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["dry_run"] is True
    assert body["package_id"] == pkg.id
    assert body["refreshed_at"] is None


async def test_refresh_validation_failure_returns_422(monkeypatch) -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    pkg = _sample_package()

    async def fake_refresh_package(existing: Package) -> str:
        assert existing.id == pkg.id
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
            headers={"X-Admin-Token": "secret-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 422


async def test_refresh_ai_error_returns_502(monkeypatch) -> None:
    os.environ["ADMIN_TOKEN"] = "secret-token"

    pkg = _sample_package()

    async def fake_refresh_package(existing: Package) -> str:
        assert existing.id == pkg.id
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
            headers={"X-Admin-Token": "secret-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 502
