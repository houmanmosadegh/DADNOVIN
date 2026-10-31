"""Data-integrity CHECK constraints — percent ranges + non-negative money.

- marketer_profiles.custom_rate: NULL or 0..100 (percent)
- commissions.rate_bp: 0..10000 (basis points, 1500 = 15%)
- commissions.basis_amount >= 0
- case_fee_receipts.amount >= 0
- payouts.amount > 0
- consultation_requests.fee_amount >= 0

Idempotent: 0001 creates fresh installs from CURRENT metadata (which now
includes these CHECKs), so every statement is guarded.

Revision: 0012_check_constraints
Revises: 0011_prod_v5_toman_payouts
"""

import sqlalchemy as sa
from alembic import op

revision = "0012_check_constraints"
down_revision = "0011_prod_v5_toman_payouts"
branch_labels = None
depends_on = None


def _has_ck(table: str, name: str) -> bool:
    return name in {
        c["name"] for c in sa.inspect(op.get_bind()).get_check_constraints(table)
    }


_CHECKS = (
    (
        "marketer_profiles",
        "ck_marketer_custom_rate",
        "custom_rate IS NULL OR (custom_rate >= 0 AND custom_rate <= 100)",
    ),
    ("commissions", "ck_commission_rate", "rate_bp >= 0 AND rate_bp <= 10000"),
    ("commissions", "ck_commission_basis", "basis_amount >= 0"),
    ("case_fee_receipts", "ck_fee_receipt_amount", "amount >= 0"),
    ("payouts", "ck_payout_amount", "amount > 0"),
    ("consultation_requests", "ck_consultation_fee", "fee_amount >= 0"),
)


def upgrade() -> None:
    for table, name, condition in _CHECKS:
        if not _has_ck(table, name):
            op.create_check_constraint(name, table, condition)


def downgrade() -> None:
    for table, name, _ in _CHECKS:
        if _has_ck(table, name):
            op.drop_constraint(name, table, type_="check")
