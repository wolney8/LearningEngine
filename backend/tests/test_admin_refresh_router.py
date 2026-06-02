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
    refreshed = Package.model_validate(
        {
            **_sample_package().model_dump(mode="python"),
            "tags": ["", " "],
            "pages": [
                {
                    "id": "p1",
                    "title": "Updated Page 1",
                    "content": "Refreshed content body.",
                }
            ],
            "questions": [
                {
                    "id": "q1",
                    "text": "Updated refreshed question?",
                    "answers": [
                        {"id": "a", "text": "Yes"},
                        {"id": "b", "text": "No"},
                    ],
                    "correct_answer": "a",
                    "weight": 100.0,
                    "feedback": "Updated feedback.",
                    "revision_page_ids": ["p1"],
                }
            ],
        }
    )

    class FakeAgent:
        async def run(self, prompt: str):
            return SimpleNamespace(output=refreshed)

    monkeypatch.setattr(ai_generator, "_get_agent", lambda **kwargs: FakeAgent())

    yaml_content = await ai_generator.refresh_package(existing, settings=None)

    raw = yaml.safe_load(yaml_content)
    assert raw["tags"] == ["existing", "Focus"]


def _sample_package_two_questions() -> Package:
    return Package.model_validate(
        {
            "id": "sample-two-questions",
            "title": "Sample Two Questions",
            "description": "A package with two questions for refresh quality tests.",
            "version": "1.0.0",
            "tags": ["demo"],
            "passing_score": 0.75,
            "pages": [
                {"id": "p1", "title": "Page 1", "content": "Original content"},
                {"id": "p2", "title": "Page 2", "content": "Original content 2"},
            ],
            "questions": [
                {
                    "id": "q1",
                    "text": "Original question one?",
                    "answers": [
                        {"id": "a", "text": "Yes"},
                        {"id": "b", "text": "No"},
                    ],
                    "correct_answer": "a",
                    "weight": 50.0,
                    "feedback": "Correct.",
                    "revision_page_ids": ["p1"],
                },
                {
                    "id": "q2",
                    "text": "Original question two?",
                    "answers": [
                        {"id": "a", "text": "True"},
                        {"id": "b", "text": "False"},
                    ],
                    "correct_answer": "a",
                    "weight": 50.0,
                    "feedback": "Correct.",
                    "revision_page_ids": ["p2"],
                },
            ],
        }
    )


def _package_with_updates(base: Package, updates: dict[str, object]) -> Package:
    data = base.model_dump(mode="python")
    data.update(updates)
    return Package.model_validate(data)


async def test_ai_refresh_retries_on_low_quality_then_succeeds(monkeypatch) -> None:
    existing = _sample_package()
    low_quality = existing
    good_refresh = _package_with_updates(
        existing,
        {
            "title": "Refreshed Title",
            "description": "Refreshed Description",
            "pages": [
                {
                    "id": "p1",
                    "title": "Updated Page 1",
                    "content": "Completely refreshed page content.",
                }
            ],
            "questions": [
                {
                    "id": "q1",
                    "text": "What changed in this refreshed package?",
                    "answers": [
                        {"id": "a", "text": "The page and question content"},
                        {"id": "b", "text": "Nothing"},
                    ],
                    "correct_answer": "a",
                    "weight": 100.0,
                    "feedback": "Correct.",
                    "revision_page_ids": ["p1"],
                }
            ],
        },
    )

    class FakeAgent:
        def __init__(self):
            self.calls = 0

        async def run(self, prompt: str):
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(output=low_quality)
            return SimpleNamespace(output=good_refresh)

    fake_agent = FakeAgent()
    monkeypatch.setattr(ai_generator, "_get_agent", lambda **kwargs: fake_agent)

    yaml_content = await ai_generator.refresh_package(existing, settings=None)

    raw = yaml.safe_load(yaml_content)
    assert raw["title"] == "Refreshed Title"
    assert raw["questions"][0]["text"] == "What changed in this refreshed package?"
    assert fake_agent.calls == 2


async def test_ai_refresh_fails_after_max_attempts_on_low_quality(monkeypatch) -> None:
    existing = _sample_package()

    class FakeAgent:
        def __init__(self):
            self.calls = 0

        async def run(self, prompt: str):
            self.calls += 1
            return SimpleNamespace(output=existing)

    fake_agent = FakeAgent()
    monkeypatch.setattr(ai_generator, "_get_agent", lambda **kwargs: fake_agent)

    try:
        await ai_generator.refresh_package(existing, settings=None)
        raise AssertionError("Expected AIGenerationError")
    except AIGenerationError as exc:
        assert "did not meet quality requirements" in str(exc)

    assert fake_agent.calls == ai_generator.REFRESH_MAX_ATTEMPTS


async def test_ai_refresh_quality_rejects_duplicate_question_text(monkeypatch) -> None:
    existing = _sample_package_two_questions()
    duplicate_questions_refresh = _package_with_updates(
        existing,
        {
            "pages": [
                {
                    "id": "p1",
                    "title": "Updated Page 1",
                    "content": "New content one.",
                },
                {
                    "id": "p2",
                    "title": "Updated Page 2",
                    "content": "New content two.",
                },
            ],
            "questions": [
                {
                    "id": "q1",
                    "text": "Duplicated question text?",
                    "answers": [
                        {"id": "a", "text": "One"},
                        {"id": "b", "text": "Two"},
                    ],
                    "correct_answer": "a",
                    "weight": 50.0,
                    "feedback": "Feedback one.",
                    "revision_page_ids": ["p1"],
                },
                {
                    "id": "q2",
                    "text": "Duplicated question text?",
                    "answers": [
                        {"id": "a", "text": "Three"},
                        {"id": "b", "text": "Four"},
                    ],
                    "correct_answer": "a",
                    "weight": 50.0,
                    "feedback": "Feedback two.",
                    "revision_page_ids": ["p2"],
                },
            ],
        },
    )

    class FakeAgent:
        async def run(self, prompt: str):
            return SimpleNamespace(output=duplicate_questions_refresh)

    monkeypatch.setattr(ai_generator, "_get_agent", lambda **kwargs: FakeAgent())

    try:
        await ai_generator.refresh_package(existing, settings=None)
        raise AssertionError("Expected AIGenerationError")
    except AIGenerationError as exc:
        assert "duplicate questions" in str(exc).lower()
