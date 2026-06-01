from __future__ import annotations

import os
from pathlib import Path

import yaml
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, SQLModel, create_engine

from app.main import app
from app.models.package import Package
from app.models.settings import GameSettings
from app.models.user import User
from app.routers.admin import (
    get_package_overrides,
    get_packages_cache,
    get_settings_cache,
)
from app.routers.users import require_admin_user
from app.services.db import get_session
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


def _sample_package(package_id: str = "sample-demo") -> Package:
    return Package.model_validate(
        {
            "id": package_id,
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
        assert get_response.json()["celebration_effects"]["enabled"] is False
        assert (
            get_response.json()["celebration_effects"]["respect_reduced_motion"]
            is True
        )

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
    assert put_response.json()["celebration_effects"]["enabled"] is False
    assert put_response.json()["celebration_effects"]["confetti_on_pass"] is True

    saved = yaml.safe_load((tmp_path / "settings.yaml").read_text(encoding="utf-8"))
    assert saved["xp"]["first_completion_bonus"] == 77
    assert saved["xp"]["base_xp_per_level"] == 500
    assert saved["celebration_effects"]["enabled"] is False
    assert saved["celebration_effects"]["lightning_on_streak_milestones"] is True


async def test_admin_settings_audit_logs_include_changed_keys_only_when_meaningful(
    tmp_path: Path,
) -> None:
    _install_admin_override()

    db_path = tmp_path / "admin-settings-audit.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)

    def session_override():
        with Session(engine) as session:
            yield session

    baseline_settings = _sample_settings()
    app.dependency_overrides[get_settings_cache] = lambda: baseline_settings
    app.dependency_overrides[get_session] = session_override

    from app.routers import admin as admin_router

    original_settings_file = admin_router.SETTINGS_FILE
    admin_router.SETTINGS_FILE = tmp_path / "settings.yaml"

    unchanged_payload = baseline_settings.model_dump(mode="json")
    changed_payload = _sample_settings(first_completion_bonus=45).model_dump(
        mode="json"
    )
    changed_payload["celebration_effects"]["enabled"] = True
    changed_payload["celebration_effects"]["confetti_on_pass"] = False

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        unchanged_response = await client.put(
            "/admin/settings",
            json=unchanged_payload,
        )
        changed_response = await client.put(
            "/admin/settings",
            json=changed_payload,
        )
        logs_response = await client.get(
            "/admin/audit-logs?action=settings.updated&limit=10"
        )

    app.dependency_overrides.clear()
    admin_router.SETTINGS_FILE = original_settings_file

    assert unchanged_response.status_code == 200
    assert changed_response.status_code == 200
    assert logs_response.status_code == 200

    logs_body = logs_response.json()
    assert len(logs_body) == 1
    assert logs_body[0]["action"] == "settings.updated"
    assert logs_body[0]["details"]["changed_count"] >= 3
    assert "xp.first_completion_bonus" in logs_body[0]["details"]["changed_keys"]
    assert "celebration_effects.enabled" in logs_body[0]["details"]["changed_keys"]
    assert "celebration_effects.confetti_on_pass" in logs_body[0]["details"][
        "changed_keys"
    ]
    assert "celebration_effects.enabled" in logs_body[0]["details"][
        "celebration_effects_changed_keys"
    ]


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


async def test_admin_package_patch_tags_persists_and_roundtrips(tmp_path: Path) -> None:
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
    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.OVERRIDES_FILE = tmp_path / "package-overrides.yaml"
    admin_router.PACKAGES_DIR = tmp_path

    (tmp_path / f"{pkg.id}.yaml").write_text(
        yaml.dump(pkg.model_dump(mode="json"), sort_keys=False),
        encoding="utf-8",
    )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        patch_response = await client.patch(
            f"/admin/packages/{pkg.id}",
            json={"tags": ["  security ", "", "Security", "awareness "]},
        )
        admin_response = await client.get("/admin/packages")

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file
    admin_router.PACKAGES_DIR = original_packages_dir

    assert patch_response.status_code == 200
    assert patch_response.json()["tags"] == ["security", "awareness"]

    assert packages_cache[pkg.id].tags == ["security", "awareness"]

    assert admin_response.status_code == 200
    assert admin_response.json()[0]["tags"] == ["security", "awareness"]

    saved_package = yaml.safe_load((tmp_path / f"{pkg.id}.yaml").read_text("utf-8"))
    assert saved_package["tags"] == ["security", "awareness"]


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


async def test_admin_delete_package_archives_by_default(tmp_path: Path) -> None:
    _install_admin_override()

    pkg = _sample_package("archive-demo")
    packages_cache = {pkg.id: pkg}
    overrides_cache: dict[str, PackageOverride] = {}
    app.state.refresh_metadata = {}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    app.state.packages = packages_cache
    app.state.package_overrides = overrides_cache

    from app.routers import admin as admin_router

    original_overrides_file = admin_router.OVERRIDES_FILE
    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.OVERRIDES_FILE = tmp_path / "package-overrides.yaml"
    admin_router.PACKAGES_DIR = tmp_path

    (tmp_path / "archive-demo.yaml").write_text("id: archive-demo", encoding="utf-8")

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        delete_response = await client.delete("/admin/packages/archive-demo")
        public_response = await client.get("/packages")

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file
    admin_router.PACKAGES_DIR = original_packages_dir

    assert delete_response.status_code == 200
    body = delete_response.json()
    assert body["package_id"] == "archive-demo"
    assert body["operation"] == "archived"
    assert body["summary"]["availability"] == "hidden"
    assert body["summary"]["enabled"] is False

    assert public_response.status_code == 200
    assert public_response.json() == []
    assert (tmp_path / "archive-demo.yaml").exists()


async def test_admin_delete_package_permanent_requires_confirm(tmp_path: Path) -> None:
    _install_admin_override()

    package_one = _sample_package("delete-demo")
    package_two = _sample_package("keep-demo")
    packages_cache = {package_one.id: package_one, package_two.id: package_two}
    overrides_cache: dict[str, PackageOverride] = {}
    app.state.refresh_metadata = {}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    app.state.packages = packages_cache
    app.state.package_overrides = overrides_cache

    from app.routers import admin as admin_router

    original_overrides_file = admin_router.OVERRIDES_FILE
    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.OVERRIDES_FILE = tmp_path / "package-overrides.yaml"
    admin_router.PACKAGES_DIR = tmp_path

    (tmp_path / "delete-demo.yaml").write_text("id: delete-demo", encoding="utf-8")

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        delete_response = await client.delete(
            "/admin/packages/delete-demo?permanent=true"
        )

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file
    admin_router.PACKAGES_DIR = original_packages_dir

    assert delete_response.status_code == 400
    assert "confirm=true" in delete_response.json()["detail"]
    assert "delete-demo" in packages_cache
    assert (tmp_path / "delete-demo.yaml").exists()


async def test_admin_delete_package_permanent_removes_file_and_cache(
    tmp_path: Path,
) -> None:
    _install_admin_override()

    package_one = _sample_package("delete-demo")
    package_two = _sample_package("keep-demo")
    packages_cache = {package_one.id: package_one, package_two.id: package_two}
    overrides_cache: dict[str, PackageOverride] = {
        "delete-demo": PackageOverride(availability="unavailable", xp_threshold=100),
        "keep-demo": PackageOverride(availability="available"),
    }
    app.state.refresh_metadata = {}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    app.state.packages = packages_cache
    app.state.package_overrides = overrides_cache

    from app.routers import admin as admin_router

    original_overrides_file = admin_router.OVERRIDES_FILE
    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.OVERRIDES_FILE = tmp_path / "package-overrides.yaml"
    admin_router.PACKAGES_DIR = tmp_path

    (tmp_path / "delete-demo.yaml").write_text("id: delete-demo", encoding="utf-8")
    (tmp_path / "keep-demo.yaml").write_text("id: keep-demo", encoding="utf-8")

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        delete_response = await client.delete(
            "/admin/packages/delete-demo?permanent=true&confirm=true"
        )
        list_response = await client.get("/admin/packages")

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file
    admin_router.PACKAGES_DIR = original_packages_dir

    assert delete_response.status_code == 200
    assert delete_response.json() == {
        "package_id": "delete-demo",
        "operation": "deleted",
        "summary": None,
    }

    assert (tmp_path / "delete-demo.yaml").exists() is False
    assert "delete-demo" not in packages_cache
    assert "delete-demo" not in overrides_cache
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == ["keep-demo"]


async def test_admin_delete_package_permanent_rejects_last_remaining_package(
    tmp_path: Path,
) -> None:
    _install_admin_override()

    package_one = _sample_package("only-package")
    packages_cache = {package_one.id: package_one}
    overrides_cache: dict[str, PackageOverride] = {}
    app.state.refresh_metadata = {}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    app.state.packages = packages_cache
    app.state.package_overrides = overrides_cache

    from app.routers import admin as admin_router

    original_overrides_file = admin_router.OVERRIDES_FILE
    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.OVERRIDES_FILE = tmp_path / "package-overrides.yaml"
    admin_router.PACKAGES_DIR = tmp_path

    (tmp_path / "only-package.yaml").write_text("id: only-package", encoding="utf-8")

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        delete_response = await client.delete(
            "/admin/packages/only-package?permanent=true&confirm=true"
        )

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file
    admin_router.PACKAGES_DIR = original_packages_dir

    assert delete_response.status_code == 409
    assert delete_response.json() == {
        "detail": "Cannot permanently delete the last remaining package"
    }
    assert "only-package" in packages_cache


async def test_admin_package_delete_writes_audit_logs_and_supports_limit(
    tmp_path: Path,
) -> None:
    _install_admin_override()

    db_path = tmp_path / "admin-audit.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)

    def session_override():
        with Session(engine) as session:
            yield session

    package_one = _sample_package("archive-demo")
    package_two = _sample_package("delete-demo")
    package_three = _sample_package("keep-demo")
    packages_cache = {
        package_one.id: package_one,
        package_two.id: package_two,
        package_three.id: package_three,
    }
    overrides_cache: dict[str, PackageOverride] = {}
    app.state.refresh_metadata = {}

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_package_overrides] = lambda: overrides_cache

    app.state.packages = packages_cache
    app.state.package_overrides = overrides_cache

    from app.routers import admin as admin_router

    original_overrides_file = admin_router.OVERRIDES_FILE
    original_packages_dir = admin_router.PACKAGES_DIR
    admin_router.OVERRIDES_FILE = tmp_path / "package-overrides.yaml"
    admin_router.PACKAGES_DIR = tmp_path

    (tmp_path / "archive-demo.yaml").write_text("id: archive-demo", encoding="utf-8")
    (tmp_path / "delete-demo.yaml").write_text("id: delete-demo", encoding="utf-8")
    (tmp_path / "keep-demo.yaml").write_text("id: keep-demo", encoding="utf-8")

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        archive_response = await client.delete("/admin/packages/archive-demo")
        delete_response = await client.delete(
            "/admin/packages/delete-demo?permanent=true&confirm=true"
        )
        logs_response = await client.get("/admin/audit-logs?limit=1")

    app.dependency_overrides.clear()
    admin_router.OVERRIDES_FILE = original_overrides_file
    admin_router.PACKAGES_DIR = original_packages_dir

    assert archive_response.status_code == 200
    assert archive_response.json()["operation"] == "archived"

    assert delete_response.status_code == 200
    assert delete_response.json()["operation"] == "deleted"

    assert logs_response.status_code == 200
    logs_body = logs_response.json()
    assert len(logs_body) == 1
    assert logs_body[0]["action"] == "package.permanently_deleted"
    assert logs_body[0]["package_id"] == "delete-demo"


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


async def test_admin_generate_package_overloaded_returns_structured_error(
    monkeypatch,
) -> None:
    _install_admin_override()

    from app.routers import admin as admin_router

    async def fake_generate_package(**kwargs):
        raise admin_router.AIGenerationError(
            "raw provider body says overloaded token=secret-value",
            error_code=admin_router.AI_ERROR_CODE_PROVIDER_OVERLOADED,
        )

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

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["error_code"] == admin_router.AI_ERROR_CODE_PROVIDER_OVERLOADED
    assert (
        detail["message"]
        == "AI provider is experiencing high demand. Please try again shortly."
    )
    assert "secret-value" not in response.text
    assert "raw provider body" not in response.text


async def test_admin_generate_package_missing_api_key_returns_structured_error(
    monkeypatch,
) -> None:
    _install_admin_override()

    from app.routers import admin as admin_router

    async def fake_generate_package(**kwargs):
        raise admin_router.AIGenerationError(
            "provider returned key missing body: api-key=leaked",
            error_code=admin_router.AI_ERROR_CODE_MISSING_API_KEY,
        )

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

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["error_code"] == admin_router.AI_ERROR_CODE_MISSING_API_KEY
    assert (
        detail["message"]
        == "AI service is not configured. Ask an administrator to add the API key."
    )
    assert "api-key=leaked" not in response.text
    assert "provider returned key missing body" not in response.text


async def test_admin_refresh_package_overloaded_returns_structured_error(
    monkeypatch,
) -> None:
    _install_admin_override()

    pkg = _sample_package("refresh-overloaded")
    packages_cache = {pkg.id: pkg}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_settings_cache] = lambda: _sample_settings()
    app.state.packages = packages_cache
    app.state.refresh_metadata = {}

    from app.routers import admin as admin_router

    async def fake_refresh_package(*args, **kwargs):
        raise admin_router.AIGenerationError(
            "raw provider refresh body exposed token=secret-value",
            error_code=admin_router.AI_ERROR_CODE_PROVIDER_OVERLOADED,
        )

    monkeypatch.setattr(admin_router, "refresh_package", fake_refresh_package)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(f"/admin/packages/{pkg.id}/refresh")

    app.dependency_overrides.clear()

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["error_code"] == admin_router.AI_ERROR_CODE_PROVIDER_OVERLOADED
    assert (
        detail["message"]
        == "AI provider is experiencing high demand. Please try again shortly."
    )
    assert "secret-value" not in response.text
    assert "raw provider refresh body" not in response.text


async def test_admin_refresh_package_missing_api_key_returns_structured_error(
    monkeypatch,
) -> None:
    _install_admin_override()

    pkg = _sample_package("refresh-missing-key")
    packages_cache = {pkg.id: pkg}

    app.dependency_overrides[get_packages_cache] = lambda: packages_cache
    app.dependency_overrides[get_settings_cache] = lambda: _sample_settings()
    app.state.packages = packages_cache
    app.state.refresh_metadata = {}

    from app.routers import admin as admin_router

    async def fake_refresh_package(*args, **kwargs):
        raise admin_router.AIGenerationError(
            "upstream key error body: api-key=leaked",
            error_code=admin_router.AI_ERROR_CODE_MISSING_API_KEY,
        )

    monkeypatch.setattr(admin_router, "refresh_package", fake_refresh_package)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(f"/admin/packages/{pkg.id}/refresh")

    app.dependency_overrides.clear()

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["error_code"] == admin_router.AI_ERROR_CODE_MISSING_API_KEY
    assert (
        detail["message"]
        == "AI service is not configured. Ask an administrator to add the API key."
    )
    assert "api-key=leaked" not in response.text
    assert "upstream key error body" not in response.text


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
        "model_used": "gemini-2.5-flash",
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
        raise admin_router.AIGenerationError(
            "raw provider error with token=secret-token-value"
        )

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
        "model_used": "gemini-2.0-flash-exp",
    }
    assert "super-secret" not in response.text
    assert "secret-token-value" not in response.text


async def test_admin_ai_connection_test_overloaded_returns_actionable_message(
    monkeypatch,
) -> None:
    _install_admin_override()

    settings_cache = _sample_settings()
    app.dependency_overrides[get_settings_cache] = lambda: settings_cache

    from app.routers import admin as admin_router

    async def fake_test_connection(**kwargs) -> None:
        raise admin_router.AIGenerationError(
            "provider overloaded; token=overload-secret",
            error_code=admin_router.AI_ERROR_CODE_PROVIDER_OVERLOADED,
        )

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
        "success": False,
        "message": (
            "AI provider is under high demand. Try again shortly or switch to a "
            "different model."
        ),
        "model_used": "gemini-2.5-flash",
    }
    assert "super-secret" not in response.text
    assert "overload-secret" not in response.text
