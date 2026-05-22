from pathlib import Path

import yaml

from app.services.package_loader import load_packages

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_DATA = {
    "id": "test-pkg",
    "title": "Test Package",
    "description": "A test package.",
    "version": "1.0.0",
    "pages": [{"id": "p1", "title": "Page", "content": "Content."}],
    "questions": [
        {
            "id": "q1",
            "text": "Question?",
            "answers": [{"id": "a", "text": "Yes"}, {"id": "b", "text": "No"}],
            "correct_answer": "a",
            "weight": 1.0,
            "feedback": "Correct.",
        }
    ],
}


def _write_yaml(tmp_path: Path, data: dict, name: str = "test.yaml") -> Path:
    f = tmp_path / name
    f.write_text(yaml.dump(data), encoding="utf-8")
    return f


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_loads_valid_yaml(tmp_path: Path) -> None:
    _write_yaml(tmp_path, _VALID_DATA, "test-pkg.yaml")
    result = load_packages(tmp_path)
    assert "test-pkg" in result
    assert result["test-pkg"].id == "test-pkg"


def test_empty_dir_returns_empty(tmp_path: Path) -> None:
    result = load_packages(tmp_path)
    assert result == {}


def test_missing_dir_returns_empty() -> None:
    result = load_packages(Path("/nonexistent-dir-xyz"))
    assert result == {}


def test_skips_malformed_yaml(tmp_path: Path) -> None:
    (tmp_path / "bad.yaml").write_text("bad: [unclosed", encoding="utf-8")
    result = load_packages(tmp_path)
    assert result == {}


def test_skips_invalid_schema(tmp_path: Path) -> None:
    bad = {**_VALID_DATA}
    del bad["title"]
    _write_yaml(tmp_path, bad)
    result = load_packages(tmp_path)
    assert result == {}


def test_multiple_files_all_loaded(tmp_path: Path) -> None:
    _write_yaml(tmp_path, _VALID_DATA, "test-pkg.yaml")
    second = {**_VALID_DATA, "id": "second-pkg"}
    _write_yaml(tmp_path, second, "second-pkg.yaml")
    result = load_packages(tmp_path)
    assert len(result) == 2
    assert "test-pkg" in result
    assert "second-pkg" in result


def test_cache_keyed_by_package_id(tmp_path: Path) -> None:
    _write_yaml(tmp_path, _VALID_DATA, "test-pkg.yaml")
    result = load_packages(tmp_path)
    assert result["test-pkg"].id == "test-pkg"
