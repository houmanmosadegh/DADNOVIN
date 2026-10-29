"""Pure commission-engine tests — rules, clamps, windows, snapshot."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from main.models.account import CommissionRule
from main.services import commission_engine as eng

pytestmark = pytest.mark.asyncio

M_ID = uuid.uuid4()
NOW = datetime.now(UTC)


def _rule(**kw) -> CommissionRule:
    r = CommissionRule(
        kind=kw.pop("kind", "fixed"),
        value=kw.pop("value", 100_000),
        tier_min=kw.pop("tier_min", 0),
        marketer_id=kw.pop("marketer_id", None),
        min_amount=kw.pop("min_amount", 0),
        max_amount=kw.pop("max_amount", 0),
        starts_at=kw.pop("starts_at", None),
        ends_at=kw.pop("ends_at", None),
        is_active=kw.pop("is_active", True),
    )
    for k, v in kw.items():
        setattr(r, k, v)
    return r


class TestResolveRule:
    async def test_override_beats_global(self):
        rules = [_rule(value=50), _rule(marketer_id=M_ID, value=999)]
        assert eng.resolve_rule(rules, M_ID, 0, NOW).value == 999

    async def test_highest_reached_tier_wins(self):
        rules = [_rule(value=1, tier_min=0), _rule(value=2, tier_min=5), _rule(value=3, tier_min=15)]
        assert eng.resolve_rule(rules, uuid.uuid4(), 7, NOW).value == 2
        assert eng.resolve_rule(rules, uuid.uuid4(), 20, NOW).value == 3

    async def test_inactive_ignored(self):
        rules = [_rule(value=9, is_active=False)]
        assert eng.resolve_rule(rules, M_ID, 0, NOW) is None

    async def test_window_respected(self):
        future = _rule(value=9, starts_at=NOW + timedelta(days=1))
        past = _rule(value=8, ends_at=NOW - timedelta(days=1))
        live = _rule(value=7)
        rules = [future, past, live]
        assert eng.resolve_rule(rules, M_ID, 0, NOW).value == 7

    async def test_no_rule(self):
        assert eng.resolve_rule([], M_ID, 0, NOW) is None


class TestComputeAmount:
    async def test_fixed(self):
        assert eng.compute_amount(_rule(kind="fixed", value=123), 0) == 123

    async def test_percent(self):
        assert eng.compute_amount(_rule(kind="percent", value=10), 2_000_000) == 200_000

    async def test_percent_floor_and_cap(self):
        r = _rule(kind="percent", value=50, min_amount=100, max_amount=300)
        assert eng.compute_amount(r, 100) == 100  # 50 → floored to 100
        assert eng.compute_amount(r, 10_000) == 300  # 5000 → capped to 300

    async def test_negative_basis_never_negative(self):
        assert eng.compute_amount(_rule(kind="percent", value=10), -5) == 0


class TestSnapshot:
    async def test_snapshot_round_trip(self):
        r = _rule(kind="percent", value=7, tier_min=3, max_amount=9)
        import json

        snap = json.loads(eng.snapshot_rule(r))
        assert snap["kind"] == "percent" and snap["value"] == 7
        assert snap["tier_min"] == 3 and snap["max_amount"] == 9
