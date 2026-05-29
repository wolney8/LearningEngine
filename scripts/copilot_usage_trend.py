#!/usr/bin/env python3
"""Generate a weekly Copilot usage trend CSV from local VS Code debug logs.

This script is intentionally local-only. It estimates premium usage pressure using
session volume and workspace agent model multipliers.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


@dataclass
class ModelBilling:
    model_id: str
    name: str
    multiplier: float
    is_premium: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create weekly Copilot usage trend CSV from local debug logs."
    )
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Repository root containing .github/agents (default: current dir).",
    )
    parser.add_argument(
        "--workspace-storage",
        default="~/Library/Application Support/Code/User/workspaceStorage",
        help="VS Code workspaceStorage root (macOS default).",
    )
    parser.add_argument(
        "--workspace-id",
        default=None,
        help="Specific workspaceStorage ID (auto-detect most recent if omitted).",
    )
    parser.add_argument(
        "--weeks",
        type=int,
        default=12,
        help="How many recent weeks to include (default: 12).",
    )
    parser.add_argument(
        "--legacy-premium-allowance",
        type=float,
        default=300.0,
        help="Legacy premium request allowance for projection (default: 300).",
    )
    parser.add_argument(
        "--out",
        default="reports/copilot-usage-weekly.csv",
        help="Output CSV path (default: reports/copilot-usage-weekly.csv).",
    )
    return parser.parse_args()


def find_workspace_log_root(storage_root: Path, workspace_id: str | None) -> Path:
    if workspace_id:
        candidate = storage_root / workspace_id / "GitHub.copilot-chat" / "debug-logs"
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"Debug logs not found for workspace ID: {workspace_id}")

    candidates: list[Path] = []
    for workspace_dir in storage_root.iterdir():
        log_dir = workspace_dir / "GitHub.copilot-chat" / "debug-logs"
        if log_dir.exists():
            candidates.append(log_dir)

    if not candidates:
        raise FileNotFoundError("No Copilot debug-logs directories found under workspaceStorage")

    return max(candidates, key=lambda p: p.stat().st_mtime)


def parse_models(log_root: Path) -> dict[str, ModelBilling]:
    model_files = list(log_root.glob("*/models.json"))
    if not model_files:
        return {}

    newest = max(model_files, key=lambda p: p.stat().st_mtime)
    raw = json.loads(newest.read_text(encoding="utf-8"))

    models: dict[str, ModelBilling] = {}
    for entry in raw:
        billing = entry.get("billing") or {}
        model_id = str(entry.get("id") or "")
        if not model_id:
            continue

        models[model_id] = ModelBilling(
            model_id=model_id,
            name=str(entry.get("name") or model_id),
            multiplier=float(billing.get("multiplier") or 0.0),
            is_premium=bool(billing.get("is_premium")),
        )

    return models


def parse_agent_models(repo_root: Path) -> dict[str, str]:
    agents_dir = repo_root / ".github" / "agents"
    result: dict[str, str] = {}
    if not agents_dir.exists():
        return result

    pattern = re.compile(r"^model:\s*(.+)\s*$", re.IGNORECASE)
    for path in sorted(agents_dir.glob("*.agent.md")):
        model_name = ""
        for line in path.read_text(encoding="utf-8").splitlines():
            m = pattern.match(line)
            if m:
                model_name = re.sub(r"\s*\([^)]*\)\s*$", "", m.group(1).strip())
                break

        agent_name = path.stem.replace(".agent", "")
        result[agent_name] = model_name

    return result


def normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def resolve_model_id(model_name: str, models: dict[str, ModelBilling]) -> str | None:
    wanted = normalise(model_name)
    if not wanted:
        return None

    aliases = [wanted, wanted.replace("preview", "")]
    ranked: list[tuple[int, str]] = []

    for model_id, info in models.items():
        hay = normalise(model_id + " " + info.name)
        score = 0
        for alias in aliases:
            if not alias:
                continue
            if alias == hay:
                score = max(score, 5)
            elif alias in hay:
                score = max(score, 4)
            elif hay in alias:
                score = max(score, 3)

        if "gpt53codex" in wanted and "gpt53codex" in hay:
            score = max(score, 4)
        if "claudesonnet46" in wanted and "claudesonnet46" in hay:
            score = max(score, 4)
        if "gemini31pro" in wanted and "gemini31pro" in hay:
            score = max(score, 4)

        if score > 0:
            ranked.append((score, model_id))

    if not ranked:
        return None

    ranked.sort(key=lambda x: x[0], reverse=True)
    return ranked[0][1]


def compute_cycle_units(
    agent_models: dict[str, str], models: dict[str, ModelBilling]
) -> tuple[float, dict[str, str]]:
    units = 0.0
    mapping: dict[str, str] = {}
    for agent, model_name in sorted(agent_models.items()):
        resolved = resolve_model_id(model_name, models)
        if not resolved:
            mapping[agent] = "unresolved"
            continue

        info = models[resolved]
        mapping[agent] = f"{resolved} (x{info.multiplier:g})"
        units += info.multiplier

    return units, mapping


def collect_session_dates(log_root: Path) -> list[date]:
    dates: list[date] = []
    for main_file in log_root.glob("*/main.jsonl"):
        with main_file.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue

                try:
                    event = json.loads(line)
                except Exception:
                    continue

                if event.get("type") != "session_start":
                    continue

                ts_ms = event.get("ts")
                if not isinstance(ts_ms, (int, float)):
                    continue

                dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
                dates.append(dt.date())

    dates.sort()
    return dates


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def build_week_rows(
    session_dates: list[date], cycle_units: float, weeks: int
) -> list[dict[str, str | int | float]]:
    if not session_dates:
        return []

    latest = max(session_dates)
    start_limit = week_start(latest) - timedelta(weeks=weeks - 1)

    counts = Counter(week_start(d) for d in session_dates if week_start(d) >= start_limit)
    rows: list[dict[str, str | int | float]] = []

    wk = start_limit
    for _ in range(weeks):
        sessions = int(counts.get(wk, 0))
        est_units = sessions * cycle_units
        rows.append(
            {
                "week_start": wk.isoformat(),
                "week_end": (wk + timedelta(days=6)).isoformat(),
                "session_starts": sessions,
                "estimated_premium_units": round(est_units, 2),
                "estimated_full_cycles": round(float(sessions), 2),
            }
        )
        wk += timedelta(weeks=1)

    return rows


def write_csv(rows: list[dict[str, str | int | float]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "week_start",
        "week_end",
        "session_starts",
        "estimated_full_cycles",
        "estimated_premium_units",
    ]
    with out_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def recent_daily_units(session_dates: list[date], cycle_units: float, days: int = 14) -> float:
    if not session_dates:
        return 0.0

    latest = max(session_dates)
    start = latest - timedelta(days=days - 1)
    daily_sessions: defaultdict[date, int] = defaultdict(int)
    for d in session_dates:
        if start <= d <= latest:
            daily_sessions[d] += 1

    total_units = sum(v * cycle_units for v in daily_sessions.values())
    return total_units / float(days)


def projected_exhaustion_date(allowance: float, daily_units: float) -> str:
    if daily_units <= 0:
        return "insufficient data"

    days_left = allowance / daily_units
    eta = datetime.now(timezone.utc).date() + timedelta(days=int(days_left))
    return eta.isoformat()


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).expanduser().resolve()
    storage_root = Path(args.workspace_storage).expanduser().resolve()

    log_root = find_workspace_log_root(storage_root, args.workspace_id)
    models = parse_models(log_root)
    agent_models = parse_agent_models(repo_root)
    cycle_units, mapping = compute_cycle_units(agent_models, models)
    session_dates = collect_session_dates(log_root)

    rows = build_week_rows(session_dates, cycle_units, args.weeks)
    out_path = Path(args.out).expanduser().resolve()
    write_csv(rows, out_path)

    daily_units = recent_daily_units(session_dates, cycle_units, days=14)
    projection = projected_exhaustion_date(args.legacy_premium_allowance, daily_units)

    print("Copilot weekly trend report")
    print("=" * 26)
    print(f"Log root: {log_root}")
    print(f"CSV: {out_path}")
    print()
    print("Agent model mapping")
    for agent, value in mapping.items():
        print(f"- {agent}: {value}")
    print(f"Estimated premium units per full cycle: {cycle_units:g}")
    print()
    print("Projection (legacy premium-request era)")
    print(f"- Allowance used for projection: {args.legacy_premium_allowance:g}")
    print(f"- 14-day average units/day: {daily_units:.2f}")
    print(f"- Projected exhaustion date: {projection}")
    print()
    print("Note: This is an estimate from local session volume, not account billing truth.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
