#!/usr/bin/env python3
"""Local Copilot usage monitor.

This script reports what can be observed from local VS Code Copilot logs and
workspace configuration. It does not call GitHub APIs and cannot read
account-level billing totals directly.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path


@dataclass
class ModelBilling:
    model_id: str
    name: str
    multiplier: float
    is_premium: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Summarise local Copilot activity and estimate premium/AI-credit "
            "burn-rate for a multi-agent workflow."
        )
    )
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Repository root containing .github/agents (default: current dir).",
    )
    parser.add_argument(
        "--workspace-storage",
        default="~/Library/Application Support/Code/User/workspaceStorage",
        help="VS Code workspaceStorage path (macOS default).",
    )
    parser.add_argument(
        "--workspace-id",
        default=None,
        help="Specific workspaceStorage ID to inspect (auto-detect if omitted).",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Recent-day window for session counts (default: 30).",
    )
    parser.add_argument(
        "--legacy-premium-allowance",
        type=float,
        default=300.0,
        help=(
            "Legacy premium request allowance for your plan, used only for "
            "request-era estimate (default: 300)."
        ),
    )
    parser.add_argument(
        "--additional-budget-usd",
        type=float,
        default=10.0,
        help="Monthly additional budget in USD (default: 10).",
    )
    parser.add_argument(
        "--included-ai-credits",
        type=float,
        default=1500.0,
        help="Monthly included AI credits (default: 1500 for Copilot Pro docs).",
    )
    parser.add_argument(
        "--credits-per-premium-unit",
        type=float,
        default=1.0,
        help=(
            "Deprecated alias for --credits-per-activity-unit. "
            "If --credits-per-activity-unit is provided, it takes precedence."
        ),
    )
    parser.add_argument(
        "--credits-per-activity-unit",
        type=float,
        default=None,
        help=(
            "Estimated AI credits consumed per calculated activity unit "
            "(default: 1.0). Calibrate from dashboard data."
        ),
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

    # Pick the most recently modified debug-logs directory.
    return max(candidates, key=lambda p: p.stat().st_mtime)


def parse_models(log_root: Path) -> dict[str, ModelBilling]:
    model_files = list(log_root.glob("*/models.json"))
    if not model_files:
        return {}

    newest = max(model_files, key=lambda p: p.stat().st_mtime)
    try:
        raw = json.loads(newest.read_text(encoding="utf-8"))
    except Exception:
        return {}

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


def parse_session_starts(log_root: Path, days: int) -> tuple[int, int]:
    total = 0
    recent = 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    for main_file in log_root.glob("*/main.jsonl"):
        try:
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

                    total += 1

                    ts_ms = event.get("ts")
                    if isinstance(ts_ms, (int, float)):
                        dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
                        if dt >= cutoff:
                            recent += 1
        except Exception:
            continue

    return total, recent


def recent_daily_units(log_root: Path, cycle_units: float, days: int) -> float:
    if days <= 0:
        return 0.0

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    recent_sessions = 0
    for main_file in log_root.glob("*/main.jsonl"):
        try:
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
                    if dt >= cutoff:
                        recent_sessions += 1
        except Exception:
            continue

    return (recent_sessions * cycle_units) / float(days)


def parse_agent_models(repo_root: Path) -> dict[str, str]:
    agents_dir = repo_root / ".github" / "agents"
    out: dict[str, str] = {}
    if not agents_dir.exists():
        return out

    pattern = re.compile(r"^model:\s*(.+)\s*$", re.IGNORECASE)
    for path in sorted(agents_dir.glob("*.agent.md")):
        model_name = ""
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                m = pattern.match(line)
                if m:
                    model_name = m.group(1).strip()
                    # Agent files commonly append provider notes, e.g. "(copilot)".
                    model_name = re.sub(r"\s*\([^)]*\)\s*$", "", model_name)
                    break
        except Exception:
            continue

        agent_name = path.stem.replace(".agent", "")
        out[agent_name] = model_name
    return out


def normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def resolve_model_id(model_name: str, models: dict[str, ModelBilling]) -> str | None:
    if not model_name:
        return None

    wanted = normalise(model_name)
    if not wanted:
        return None

    preferred_aliases = [
        wanted,
        wanted.replace("preview", ""),
        wanted.replace("model", ""),
    ]

    ranked: list[tuple[int, str]] = []
    for model_id, info in models.items():
        hay = normalise(model_id + " " + info.name)
        score = 0
        for alias in preferred_aliases:
            if not alias:
                continue
            if alias == hay:
                score = max(score, 5)
            elif alias in hay:
                score = max(score, 4)
            elif hay in alias:
                score = max(score, 3)

        # Fallback fuzzy contains checks for common vendor/model naming variants.
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


def count_workspace_factors(repo_root: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    counts["agents"] = len(list((repo_root / ".github" / "agents").glob("*.agent.md")))
    counts["skills"] = len([p for p in (repo_root / ".github" / "skills").iterdir() if p.is_dir()]) if (repo_root / ".github" / "skills").exists() else 0
    counts["instructions"] = len(list((repo_root / ".github" / "instructions").glob("*.instructions.md")))
    counts["hook_configs"] = len(list((repo_root / ".github" / "hooks").glob("*.json")))
    counts["hook_scripts"] = len(list((repo_root / ".github" / "hooks" / "scripts").glob("*.sh")))
    return counts


def print_report(
    log_root: Path,
    models: dict[str, ModelBilling],
    agent_models: dict[str, str],
    workspace_counts: Counter[str],
    sessions_total: int,
    sessions_recent: int,
    days: int,
    allowance: float,
    budget_usd: float,
    included_ai_credits: float,
    credits_per_activity_unit: float,
) -> None:
    print("Copilot local usage monitor")
    print("=" * 28)
    print(f"Log root: {log_root}")
    print()

    print("Workspace factors")
    print("-" * 18)
    print(f"Agents: {workspace_counts['agents']}")
    print(f"Skills: {workspace_counts['skills']}")
    print(f"Instructions: {workspace_counts['instructions']}")
    print(f"Hook configs: {workspace_counts['hook_configs']}")
    print(f"Hook scripts: {workspace_counts['hook_scripts']}")
    print()

    print("Session signals")
    print("-" * 16)
    print(f"Session starts found: {sessions_total}")
    print(f"Session starts in last {days} days: {sessions_recent}")
    print()

    print("Agent model mapping")
    print("-" * 19)
    cycle_billing_units = 0.0
    cycle_activity_units = 0.0
    mapped = 0
    for agent, model_name in sorted(agent_models.items()):
        resolved = resolve_model_id(model_name, models)
        if not resolved:
            print(f"{agent}: {model_name or '(not set)'} -> unresolved")
            continue

        info = models[resolved]
        mapped += 1
        cycle_billing_units += info.multiplier
        cycle_activity_units += info.multiplier if info.multiplier > 0 else 1.0
        premium_text = "premium" if info.is_premium else "included"
        print(
            f"{agent}: {model_name or '(not set)'} -> {resolved} "
            f"({premium_text}, multiplier {info.multiplier:g})"
        )

    print()
    additional_ai_credits = budget_usd * 100.0
    total_credit_capacity = included_ai_credits + additional_ai_credits

    if mapped == 0:
        print("No agent model mappings resolved from local model catalogue.")
    else:
        print("Legacy premium-request estimate")
        print("-" * 31)
        print(
            f"Estimated premium billing units per full multi-agent cycle: "
            f"{cycle_billing_units:g}"
        )
        if cycle_billing_units > 0:
            cycles = allowance / cycle_billing_units
            print(
                f"Approx full cycles before {allowance:g} premium requests are exhausted: "
                f"{cycles:.1f}"
            )
        else:
            print("All mapped models are included-tier in this catalogue (multiplier 0).")

        daily_activity_units = recent_daily_units(log_root, cycle_activity_units, days)
        daily_ai_credits = daily_activity_units * credits_per_activity_unit

        print()
        print("Usage-based AI-credit estimate")
        print("-" * 30)
        print(
            f"Estimated activity units/day (last {days}d): {daily_activity_units:.2f}"
        )
        print(
            f"Calibration factor: {credits_per_activity_unit:.3f} AI credits per activity unit"
        )
        print(f"Estimated AI credits/day: {daily_ai_credits:.2f}")

        if daily_ai_credits > 0:
            days_to_included = included_ai_credits / daily_ai_credits
            days_to_total = total_credit_capacity / daily_ai_credits
            print(
                f"Projected days to exhaust included credits ({included_ai_credits:.0f}): "
                f"{days_to_included:.1f}"
            )
            print(
                f"Projected days to exhaust included + additional ({total_credit_capacity:.0f}): "
                f"{days_to_total:.1f}"
            )
        else:
            print("Insufficient recent activity to project exhaustion runway.")

    print()
    print("Usage-based billing reminder")
    print("-" * 29)
    credits = additional_ai_credits
    print(f"Included AI credits/month: {included_ai_credits:.0f}")
    print(
        f"Additional budget ${budget_usd:.2f} ~= {credits:.0f} AI credits "
        "(1 credit = $0.01)."
    )
    print(f"Total estimated monthly AI-credit capacity: {total_credit_capacity:.0f}")
    print(
        "This local script cannot read your account's exact consumed AI credits; "
        "check GitHub Copilot usage dashboard for authoritative totals."
    )


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).expanduser().resolve()
    storage_root = Path(args.workspace_storage).expanduser().resolve()

    if not storage_root.exists():
        print(f"workspaceStorage path does not exist: {storage_root}")
        return 2

    try:
        log_root = find_workspace_log_root(storage_root, args.workspace_id)
    except FileNotFoundError as exc:
        print(str(exc))
        return 2

    models = parse_models(log_root)
    sessions_total, sessions_recent = parse_session_starts(log_root, args.days)
    agent_models = parse_agent_models(repo_root)
    workspace_counts = count_workspace_factors(repo_root)

    credits_per_activity_unit = (
        args.credits_per_activity_unit
        if args.credits_per_activity_unit is not None
        else args.credits_per_premium_unit
    )

    print_report(
        log_root=log_root,
        models=models,
        agent_models=agent_models,
        workspace_counts=workspace_counts,
        sessions_total=sessions_total,
        sessions_recent=sessions_recent,
        days=args.days,
        allowance=args.legacy_premium_allowance,
        budget_usd=args.additional_budget_usd,
        included_ai_credits=args.included_ai_credits,
        credits_per_activity_unit=credits_per_activity_unit,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
