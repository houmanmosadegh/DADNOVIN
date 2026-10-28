"""audit_logs: actor_email → actor_username (matches username-based login).

Existing rows keep their value; the column just gets a truthful name.
Idempotent for fresh installs where 0001 already created the new name.

Revision ID: 0004_audit_actor_username
Revises: 0003_user_username
Create Date: 2026-10-28
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_audit_actor_username"
down_revision = "0003_user_username"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("audit_logs")}
    if "actor_email" in cols and "actor_username" not in cols:
        op.alter_column(
            "audit_logs",
            "actor_email",
            new_column_name="actor_username",
            existing_type=sa.String(length=255),
        )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("audit_logs")}
    if "actor_username" in cols and "actor_email" not in cols:
        op.alter_column(
            "audit_logs",
            "actor_username",
            new_column_name="actor_email",
            existing_type=sa.String(length=255),
        )
