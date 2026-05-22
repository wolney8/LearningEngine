#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ID_PATTERN = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")


def valid_package_id(value: str) -> str:
    if not ID_PATTERN.fullmatch(value):
        raise argparse.ArgumentTypeError(
            "--id must match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
        )
    return value


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("value must be >= 1")
    return parsed


def quote_yaml(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def build_weights(question_count: int) -> list[int]:
    base = 100 // question_count
    weights = [base] * question_count
    weights[-1] += 100 - (base * question_count)
    return weights


def build_yaml(package_id: str, title: str, pages: int, questions: int) -> str:
    lines: list[str] = [
        f"id: {package_id}",
        f"title: {quote_yaml(title)}",
        'description: "TODO: describe this package"',
        'version: "1.0.0"',
        "tags: []",
        "passing_score: 0.80",
        "",
        "pages:",
    ]

    for page_index in range(1, pages + 1):
        lines.extend(
            [
                f"  - id: page-{page_index}",
                f"    title: {quote_yaml(f'TODO: Page {page_index} Title')}",
                "    content: |",
                f"      # TODO: Page {page_index} Title",
                "      ",
                "      Write your content here in Markdown.",
            ]
        )

    lines.extend(["", "questions:"])
    weights = build_weights(questions)
    for question_index in range(1, questions + 1):
        lines.extend(
            [
                f"  - id: q{question_index}",
                f"    text: {quote_yaml(f'TODO: Question {question_index}')}",
                "    answers:",
                "      - id: a1",
                '        text: "TODO: Answer 1"',
                "      - id: a2",
                '        text: "TODO: Answer 2"',
                "      - id: a3",
                '        text: "TODO: Answer 3"',
                "      - id: a4",
                '        text: "TODO: Answer 4"',
                "    correct_answer: a1",
                f"    weight: {weights[question_index - 1]}",
                '    feedback: "TODO: Explain why the correct answer is correct."',
                "    revision_page_ids:",
                "      - page-1",
            ]
        )

    lines.append("")
    return "\n".join(lines)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a YAML package scaffold.")
    parser.add_argument("--id", required=True, type=valid_package_id, dest="package_id")
    parser.add_argument("--title", required=True)
    parser.add_argument("--pages", type=positive_int, default=3)
    parser.add_argument("--questions", type=positive_int, default=4)
    parser.add_argument("--output")
    parser.add_argument("--force", action="store_true")
    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    output_path = (
        Path(args.output)
        if args.output
        else repo_root / "packages" / f"{args.package_id}.yaml"
    )

    if output_path.exists() and not args.force:
        print(
            f"Warning: {output_path} already exists. Use --force to overwrite.",
            file=sys.stderr,
        )
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    yaml_content = build_yaml(args.package_id, args.title, args.pages, args.questions)
    output_path.write_text(yaml_content, encoding="utf-8")

    print(f"Created package scaffold at {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
