"""tickets.access_code_hash: varchar(64) → varchar(128).

Argon2id hashes are ~97 chars; String(64) silently passed on SQLite tests
but fails on PostgreSQL with StringDataRightTruncationError.

Revision ID: 0002_ticket_access_code_len
Revises: 0001_initial
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_ticket_access_code_len"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "tickets",
        "access_code_hash",
        existing_type=sa.String(length=64),
        type_=sa.String(length=128),
    )


def downgrade() -> None:
    op.alter_column(
        "tickets",
        "access_code_hash",
        existing_type=sa.String(length=128),
        type_=sa.String(length=64),
    )
