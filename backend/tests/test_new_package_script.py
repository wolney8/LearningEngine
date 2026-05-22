from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import yaml

from app.models.package import Package


def test_new_package_script_generates_valid_yaml_and_force_behaviour(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    script_path = repo_root / "scripts" / "new_package.py"
    output_path = tmp_path / "generated-package.yaml"

    command = [
        sys.executable,
        str(script_path),
        "--id",
        "python-lists",
        "--title",
        "Python Lists",
        "--pages",
        "3",
        "--questions",
        "3",
        "--output",
        str(output_path),
    ]

    first = subprocess.run(command, capture_output=True, text=True, check=False)
    assert first.returncode == 0
    assert output_path.exists()

    data = yaml.safe_load(output_path.read_text(encoding="utf-8"))
    package = Package.model_validate(data)
    assert package.id == "python-lists"
    assert sum(question.weight for question in package.questions) == 100

    second = subprocess.run(command, capture_output=True, text=True, check=False)
    assert second.returncode == 1
    assert "already exists" in second.stderr

    with_force = subprocess.run(
        [*command, "--force"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert with_force.returncode == 0
    assert "Created package scaffold" in with_force.stdout
