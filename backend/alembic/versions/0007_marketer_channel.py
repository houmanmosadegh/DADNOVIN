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


def upgrade() -> None:
    op.add_column(
        "marketer_applications",
        sa.Column("channel", sa.String(200), nullable=False, server_default=""),
    )
    op.add_column(
        "marketer_applications",
        sa.Column("accepted_terms", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("marketer_applications", "accepted_terms")
    op.drop_column("marketer_applications", "channel")
