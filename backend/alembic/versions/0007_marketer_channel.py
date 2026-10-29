"""Marketer application channel + terms acceptance.

Revision ID: 0007_marketer_channel
Revises: 0006_accounts_referrals
"""

import sqlalchemy as sa
from alembic import op

revision = "0007_marketer_channel"
down_revision = "0006_accounts_referrals"
branch_labels = None
depends_on = None


def _has_col(table: str, col: str) -> bool:
    return col in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # guarded — 0001 materializes current ORM schema (see 0006 comment)
    if not _has_col("marketer_applications", "channel"):
        op.add_column(
            "marketer_applications",
            sa.Column("channel", sa.String(200), nullable=False, server_default=""),
        )
    if not _has_col("marketer_applications", "accepted_terms"):
        op.add_column(
            "marketer_applications",
            sa.Column("accepted_terms", sa.Boolean(), nullable=False, server_default=sa.true()),
        )


def downgrade() -> None:
    op.drop_column("marketer_applications", "accepted_terms")
    op.drop_column("marketer_applications", "channel")
