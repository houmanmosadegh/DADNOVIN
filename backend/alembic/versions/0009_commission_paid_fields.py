"""Manual commission settlement fields — paid_at/paid_note/paid_by.

Revision ID: 0009_commission_paid_fields
Revises: 0008_referral_links_rules
"""

import sqlalchemy as sa
from alembic import op

revision = "0009_commission_paid_fields"
down_revision = "0008_referral_links_rules"
branch_labels = None
depends_on = None


def _has_col(table: str, col: str) -> bool:
    return col in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _add_col(table: str, col: sa.Column) -> None:
    if not _has_col(table, col.name):
        op.add_column(table, col)


def upgrade() -> None:
    _add_col(
        "commissions",
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    _add_col(
        "commissions",
        sa.Column("paid_note", sa.String(length=300), nullable=False, server_default=""),
    )
    _add_col("commissions", sa.Column("paid_by", sa.Uuid(), nullable=True))


def downgrade() -> None:
    for col in ("paid_by", "paid_note", "paid_at"):
        if _has_col("commissions", col):
            op.drop_column("commissions", col)
