import hashlib
import os
from datetime import datetime, timedelta, timezone

import yaml

from app.models.package import Package
from app.models.refresh import PackageRefreshRecord
from app.services.refresh_service import (
    _bump_patch_version,
    compute_diff_summary,
    detect_stale_packages,
    get_last_updated_at,
    write_refreshed_package,
)


def _sample_package(
    package_id: str = "sample-demo",
    version: str = "1.0.0",
    page_content: str = "Base page content",
    question_text: str = "Base question text?",
) -> Package:
    return Package.model_validate(
        {
            "id": package_id,
            "title": "Sample Demo",
            "description": "Sample package",
            "version": version,
            "tags": ["demo"],
            "passing_score": 0.8,
            "pages": [
                {
                    "id": "p1",
                    "title": "Page 1",
                    "content": page_content,
                }
            ],
            "questions": [
                {
                    "id": "q1",
                    "text": question_text,
                    "answers": [
                        {"id": "a", "text": "Yes"},
                        {"id": "b", "text": "No"},
                    ],
                    "correct_answer": "a",
                    "weight": 100.0,
                    "feedback": "Feedback",
                    "revision_page_ids": ["p1"],
                }
            ],
        }
    )


def _package_yaml(pkg: Package) -> str:
    return yaml.safe_dump(pkg.model_dump(mode="json"), sort_keys=False)


def test_bump_patch_version() -> None:
    assert _bump_patch_version("2.3.7") == "2.3.8"
    assert _bump_patch_version("1.0.0") == "1.0.1"


def test_detect_stale_returns_package_older_than_threshold(tmp_path) -> None:
    pkg = _sample_package()
    package_file = tmp_path / f"{pkg.id}.yaml"
    package_file.write_text(_package_yaml(pkg), encoding="utf-8")

    old_time = datetime.now(tz=timezone.utc) - timedelta(days=100)
    os.utime(package_file, (old_time.timestamp(), old_time.timestamp()))

    stale = detect_stale_packages(
        {pkg.id: pkg},
        {},
        stale_after_days=90,
        packages_dir=tmp_path,
    )
    assert len(stale) == 1
    assert stale[0].id == pkg.id


def test_detect_stale_excludes_fresh_packages(tmp_path) -> None:
    pkg = _sample_package()
    package_file = tmp_path / f"{pkg.id}.yaml"
    package_file.write_text(_package_yaml(pkg), encoding="utf-8")

    fresh_time = datetime.now(tz=timezone.utc) - timedelta(days=10)
    os.utime(package_file, (fresh_time.timestamp(), fresh_time.timestamp()))

    stale = detect_stale_packages(
        {pkg.id: pkg},
        {},
        stale_after_days=90,
        packages_dir=tmp_path,
    )
    assert stale == []


def test_detect_stale_uses_refresh_metadata_over_mtime(tmp_path) -> None:
    pkg = _sample_package()
    package_file = tmp_path / f"{pkg.id}.yaml"
    package_file.write_text(_package_yaml(pkg), encoding="utf-8")

    old_time = datetime.now(tz=timezone.utc) - timedelta(days=100)
    os.utime(package_file, (old_time.timestamp(), old_time.timestamp()))

    refresh_metadata = {
        pkg.id: PackageRefreshRecord(
            refreshed_at=datetime.now(tz=timezone.utc) - timedelta(days=5),
            previous_version="1.0.0",
            new_version="1.0.1",
            diff_summary="updated",
            content_hash="abc",
        )
    }

    stale = detect_stale_packages(
        {pkg.id: pkg}, refresh_metadata, stale_after_days=90, packages_dir=tmp_path
    )
    assert stale == []


def test_detect_stale_uses_refresh_metadata_if_stale(tmp_path) -> None:
    pkg = _sample_package()
    package_file = tmp_path / f"{pkg.id}.yaml"
    package_file.write_text(_package_yaml(pkg), encoding="utf-8")

    recent_mtime = datetime.now(tz=timezone.utc) - timedelta(days=1)
    os.utime(package_file, (recent_mtime.timestamp(), recent_mtime.timestamp()))

    refresh_metadata = {
        pkg.id: PackageRefreshRecord(
            refreshed_at=datetime.now(tz=timezone.utc) - timedelta(days=100),
            previous_version="1.0.0",
            new_version="1.0.1",
            diff_summary="updated",
            content_hash="abc",
        )
    }

    stale = detect_stale_packages(
        {pkg.id: pkg}, refresh_metadata, stale_after_days=90, packages_dir=tmp_path
    )
    assert len(stale) == 1
    assert stale[0].id == pkg.id


def test_write_refreshed_creates_bak(tmp_path) -> None:
    old_pkg = _sample_package(version="1.0.0", page_content="old")
    package_file = tmp_path / f"{old_pkg.id}.yaml"
    original_yaml = _package_yaml(old_pkg)
    package_file.write_text(original_yaml, encoding="utf-8")

    refreshed_pkg = _sample_package(version="2.0.0", page_content="new")
    metadata: dict[str, PackageRefreshRecord] = {}
    metadata_file = tmp_path / "package-refresh-metadata.yaml"

    write_refreshed_package(
        old_pkg.id,
        _package_yaml(refreshed_pkg),
        tmp_path,
        old_pkg,
        metadata,
        metadata_file,
        datetime.now(tz=timezone.utc),
    )

    backup_file = tmp_path / f"{old_pkg.id}.yaml.bak"
    assert backup_file.exists()
    assert backup_file.read_text(encoding="utf-8") == original_yaml


def test_write_refreshed_atomic_new_file_written(tmp_path) -> None:
    old_pkg = _sample_package(version="1.0.0", page_content="old")
    package_file = tmp_path / f"{old_pkg.id}.yaml"
    package_file.write_text(_package_yaml(old_pkg), encoding="utf-8")

    refreshed_pkg = _sample_package(version="9.9.9", page_content="new")
    metadata: dict[str, PackageRefreshRecord] = {}
    metadata_file = tmp_path / "package-refresh-metadata.yaml"

    _, record = write_refreshed_package(
        old_pkg.id,
        _package_yaml(refreshed_pkg),
        tmp_path,
        old_pkg,
        metadata,
        metadata_file,
        datetime.now(tz=timezone.utc),
    )

    written_bytes = package_file.read_bytes()
    assert hashlib.sha256(written_bytes).hexdigest() == record.content_hash


def test_write_refreshed_id_preserved(tmp_path) -> None:
    old_pkg = _sample_package(package_id="keep-id", version="1.0.0")
    package_file = tmp_path / f"{old_pkg.id}.yaml"
    package_file.write_text(_package_yaml(old_pkg), encoding="utf-8")

    generated_pkg = _sample_package(package_id="different-id", version="1.0.0")
    metadata: dict[str, PackageRefreshRecord] = {}
    metadata_file = tmp_path / "package-refresh-metadata.yaml"

    new_pkg, _ = write_refreshed_package(
        old_pkg.id,
        _package_yaml(generated_pkg),
        tmp_path,
        old_pkg,
        metadata,
        metadata_file,
        datetime.now(tz=timezone.utc),
    )

    assert new_pkg.id == old_pkg.id


def test_write_refreshed_version_bumped(tmp_path) -> None:
    old_pkg = _sample_package(version="1.0.0")
    package_file = tmp_path / f"{old_pkg.id}.yaml"
    package_file.write_text(_package_yaml(old_pkg), encoding="utf-8")

    generated_pkg = _sample_package(version="3.7.9")
    metadata: dict[str, PackageRefreshRecord] = {}
    metadata_file = tmp_path / "package-refresh-metadata.yaml"

    new_pkg, _ = write_refreshed_package(
        old_pkg.id,
        _package_yaml(generated_pkg),
        tmp_path,
        old_pkg,
        metadata,
        metadata_file,
        datetime.now(tz=timezone.utc),
    )

    assert new_pkg.version == "1.0.1"


def test_compute_diff_summary_counts_changes() -> None:
    old_pkg = _sample_package(page_content="old page", question_text="old question?")
    new_pkg = _sample_package(page_content="new page", question_text="new question?")

    summary = compute_diff_summary(old_pkg, new_pkg)

    assert summary
    assert "page(s) updated" in summary
    assert "question(s) updated" in summary


def test_get_last_updated_at_returns_metadata_value(tmp_path) -> None:
    refreshed_at = datetime.now(tz=timezone.utc) - timedelta(days=3)
    refresh_metadata = {
        "sample-demo": PackageRefreshRecord(
            refreshed_at=refreshed_at,
            previous_version="1.0.0",
            new_version="1.0.1",
            diff_summary="updated",
            content_hash="abc",
        )
    }

    actual = get_last_updated_at("sample-demo", refresh_metadata, tmp_path)
    assert actual == refreshed_at
# end
