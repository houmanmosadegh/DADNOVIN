"""Pure commission engine — no DB access, fully unit-testable.

Rule resolution order (per spec):
  1) a rule pinned to this marketer (override)
  2) the highest global tier reached (tier_min <= accepted count)
  3) nothing → no commission

A rule applies only inside its validity window [starts_at, ends_at] and
when active. The computed amount is clamped to [min_amount, max_amount]
(0 = unbounded). `compute_amount` and `resolve_rule` are pure functions —
the service layer fetches rows and calls these.
"""

import json
from datetime import UTC, datetime
from typing import Any

from ..models.account import CommissionRule


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def rule_active_at(rule: CommissionRule, now: datetime | None = None) -> bool:
    """Validity window check — None bounds are open-ended."""
    if not rule.is_active:
        return False
    now = now or datetime.now(UTC)
    start, end = _aware(rule.starts_at), _aware(rule.ends_at)
    if start is not None and now < start:
        return False
    if end is not None and now >= end:
        return False
    return True


def resolve_rule(
    rules: list[CommissionRule],
    marketer_id,
    accepted_count: int,
    now: datetime | None = None,
) -> CommissionRule | None:
    """Pick the applicable rule: override > highest reached global tier."""
    now = now or datetime.now(UTC)
    eligible = [r for r in rules if rule_active_at(r, now)]
    overrides = [r for r in eligible if r.marketer_id == marketer_id]
    if overrides:
        return max(overrides, key=lambda r: r.tier_min)
    tiers = [r for r in eligible if r.marketer_id is None and accepted_count >= r.tier_min]
    if not tiers:
        return None
    return max(tiers, key=lambda r: r.tier_min)


def compute_amount(rule: CommissionRule, basis_amount: int) -> int:
    """fixed → rule.value; percent → basis*value//100 — then clamped."""
    if rule.kind == "percent":
        amount = max(0, basis_amount) * rule.value // 100
    else:
        amount = rule.value
    if rule.min_amount and amount < rule.min_amount:
        amount = rule.min_amount
    if rule.max_amount and amount > rule.max_amount:
        amount = rule.max_amount
    return max(0, amount)


def snapshot_rule(rule: CommissionRule) -> str:
    """JSON snapshot stored on the commission — history survives rule edits."""
    return json.dumps(
        {
            "rule_id": str(rule.id),
            "kind": rule.kind,
            "value": rule.value,
            "tier_min": rule.tier_min,
            "min_amount": rule.min_amount,
            "max_amount": rule.max_amount,
            "starts_at": rule.starts_at.isoformat() if rule.starts_at else None,
            "ends_at": rule.ends_at.isoformat() if rule.ends_at else None,
        },
        ensure_ascii=False,
    )


def describe_rule(rule: dict[str, Any]) -> str:
    """Human-readable summary for the preview calculator."""
    if rule["kind"] == "percent":
        base = f"{rule['value']}٪ از مبنا"
    else:
        base = f"مبلغ ثابت {rule['value']:,} ریال"
    extras = []
    if rule.get("tier_min"):
        extras.append(f"از {rule['tier_min']}مین پذیرش")
    if rule.get("max_amount"):
        extras.append(f"سقف {rule['max_amount']:,} ریال")
    if rule.get("min_amount"):
        extras.append(f"کف {rule['min_amount']:,} ریال")
    return base + (" — " + "، ".join(extras) if extras else "")
