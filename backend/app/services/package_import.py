from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import yaml
from pydantic import ValidationError

from app.models.package import Package


@dataclass(frozen=True)
class PackageImportIssue:
    message: str
    path: list[str]
    line: int | None = None
    column: int | None = None


@dataclass(frozen=True)
class PackageImportValidationResult:
    package: Package | None
    issues: list[PackageImportIssue]

    @property
    def valid(self) -> bool:
        return self.package is not None and not self.issues


def format_package_import_issue(issue: PackageImportIssue) -> str:
    location_parts: list[str] = []
    if issue.line is not None and issue.column is not None:
        location_parts.append(f"line {issue.line}, column {issue.column}")
    if issue.path:
        location_parts.append(" -> ".join(issue.path))
    if location_parts:
        return f"{', '.join(location_parts)}: {issue.message}"
    return issue.message


def _yaml_parse_issue(exc: yaml.YAMLError) -> PackageImportIssue:
    line: int | None = None
    column: int | None = None
    mark = getattr(exc, "problem_mark", None)
    if mark is not None:
        line = getattr(mark, "line", None)
        column = getattr(mark, "column", None)
        if isinstance(line, int):
            line += 1
        if isinstance(column, int):
            column += 1

    message = getattr(exc, "problem", None) or str(exc)
    return PackageImportIssue(
        message=f"YAML parse error: {message}",
        path=[],
        line=line,
        column=column,
    )


def _schema_issues(exc: ValidationError) -> list[PackageImportIssue]:
    issues: list[PackageImportIssue] = []
    for error in exc.errors():
        issues.append(
            PackageImportIssue(
                message=error["msg"],
                path=[str(loc) for loc in error["loc"]],
            )
        )
    return issues


def validate_package_yaml_content(
    yaml_content: str,
    *,
    existing_package_ids: set[str] | None = None,
) -> PackageImportValidationResult:
    try:
        raw = yaml.safe_load(yaml_content)
    except yaml.YAMLError as exc:
        return PackageImportValidationResult(
            package=None,
            issues=[_yaml_parse_issue(exc)],
        )

    if not isinstance(raw, dict):
        return PackageImportValidationResult(
            package=None,
            issues=[
                PackageImportIssue(
                    message="YAML must define a package object at the document root.",
                    path=[],
                )
            ],
        )

    try:
        package = Package.model_validate(raw)
    except ValidationError as exc:
        return PackageImportValidationResult(package=None, issues=_schema_issues(exc))

    if existing_package_ids and package.id in existing_package_ids:
        return PackageImportValidationResult(
            package=None,
            issues=[
                PackageImportIssue(
                    message=f"Package id '{package.id}' already exists.",
                    path=["id"],
                )
            ],
        )

    return PackageImportValidationResult(package=package, issues=[])


def summarise_package_preview(package: Package) -> dict[str, Any]:
    return {
        "id": package.id,
        "title": package.title,
        "description": package.description,
        "version": package.version,
        "page_count": len(package.pages),
        "question_count": len(package.questions),
    }
