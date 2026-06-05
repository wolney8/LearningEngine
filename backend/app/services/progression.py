from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.models.user import SpendHistory, User, UserTestResult

STALE_WINDOW_DAYS = 7
DECAY_RATE = 0.10
XP_DECAY_FLOOR = 100
REFRESHER_DIFFICULTY = "normal"
_STALE_WINDOW = timedelta(days=STALE_WINDOW_DAYS)


@dataclass
class XPDecayNotice:
    deducted_xp: int
    stale_package_count: int
    intervals_applied: int
    floor_reached: bool

    def to_payload(self) -> dict[str, int | bool]:
        return {
            "deducted_xp": self.deducted_xp,
            "stale_package_count": self.stale_package_count,
            "intervals_applied": self.intervals_applied,
            "floor_reached": self.floor_reached,
            "stale_window_days": STALE_WINDOW_DAYS,
        }


def _normalise_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _stale_intervals(last_passed_at: datetime, now: datetime) -> int:
    stale_start = last_passed_at + _STALE_WINDOW
    if now < stale_start:
        return 0
    elapsed = now - stale_start
    return int(elapsed // _STALE_WINDOW) + 1


def _per_interval_decay(base_xp: int) -> int:
    if base_xp <= 0:
        return 0
    return max(1, round(base_xp * DECAY_RATE))


def apply_lazy_xp_decay(
    session: Session,
    current_user: User,
    *,
    now: datetime | None = None,
) -> XPDecayNotice | None:
    user_id = current_user.id
    if user_id is None:
        return None

    current_time = _normalise_datetime(now) or datetime.now(timezone.utc)
    rows = session.exec(
        select(UserTestResult).where(UserTestResult.user_id == user_id)
    ).all()

    total_deduction = 0
    stale_package_count = 0
    intervals_applied = 0
    changed = False

    for row in rows:
        last_passed_at = _normalise_datetime(row.refresher_last_passed_at)
        if last_passed_at is None:
            continue

        interval_count = _stale_intervals(last_passed_at, current_time)
        if interval_count <= row.refresher_decay_intervals_applied:
            continue

        delta_intervals = interval_count - row.refresher_decay_intervals_applied
        row.refresher_decay_intervals_applied = interval_count
        stale_package_count += 1
        intervals_applied += delta_intervals
        changed = True

        per_interval = _per_interval_decay(row.refresher_best_xp_base)
        if per_interval > 0:
            total_deduction += per_interval * delta_intervals

        session.add(row)

    if not changed:
        return None

    original_xp = current_user.xp
    if total_deduction > 0:
        floor = min(original_xp, XP_DECAY_FLOOR)
        current_user.xp = max(floor, current_user.xp - total_deduction)
        session.add(current_user)

    session.commit()
    session.refresh(current_user)

    actual_deduction = max(0, original_xp - current_user.xp)
    return XPDecayNotice(
        deducted_xp=actual_deduction,
        stale_package_count=stale_package_count,
        intervals_applied=intervals_applied,
        floor_reached=current_user.xp == min(original_xp, XP_DECAY_FLOOR)
        and original_xp > XP_DECAY_FLOOR,
    )


def refresh_refresher_progress(
    result: UserTestResult,
    *,
    completed: bool,
    best_xp_earned: int,
    now: datetime,
) -> None:
    if not completed:
        return

    result.refresher_last_passed_at = now
    result.refresher_decay_intervals_applied = 0
    result.refresher_best_xp_base = max(result.refresher_best_xp_base, best_xp_earned)


def should_auto_unlock_hard(result: UserTestResult, now: datetime) -> bool:
    last_passed_at = _normalise_datetime(result.refresher_last_passed_at)
    if last_passed_at is None:
        return False

    return now >= last_passed_at + _STALE_WINDOW


def ensure_hard_unlocked_for_refresher(
    session: Session,
    *,
    user_id: int,
    package_id: str,
    now: datetime,
) -> bool:
    existing_unlock = session.exec(
        select(SpendHistory).where(
            SpendHistory.user_id == user_id,
            SpendHistory.action == "difficulty_unlock",
            SpendHistory.package_id == package_id,
            SpendHistory.difficulty == "hard",
            SpendHistory.success == True,  # noqa: E712
        )
    ).first()
    if existing_unlock is not None:
        return False

    session.add(
        SpendHistory(
            user_id=user_id,
            action="difficulty_unlock",
            package_id=package_id,
            difficulty="hard",
            cost=0,
            success=True,
            created_at=now,
        )
    )
    return True
