"""users: add unique username (login identifier); email becomes optional.

Backfills username from the email local-part so existing admins keep working
(admin@dadnovin.ir → 'admin'). Drops the UNIQUE on email — several users may
legitimately have no email ('') which would collide under UNIQUE.

Idempotent: 0001 materializes *current* ORM metadata, so on a fresh install
the column/index may already exist — guards check before applying.

Revision ID: 0003_user_username
Revises: 0002_ticket_access_code_len
Create Date: 2026-10-28
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_user_username"
down_revision = "0002_ticket_access_code_len"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("users")}
    if "username" not in cols:
        op.add_column("users", sa.Column("username", sa.String(length=80), nullable=True))
        op.execute(
            """
            UPDATE users SET username = lower(
                CASE WHEN email <> ''
                     THEN split_part(email, '@', 1)
                     ELSE 'user-' || substr(id::text, 1, 8)
                END
            )
            """
        )
        op.alter_column("users", "username", nullable=False)
        op.create_index("ix_users_username", "users", ["username"], unique=True)

    idx = {i["name"]: i for i in insp.get_indexes("users")}
    if idx.get("ix_users_email", {}).get("unique"):
        op.drop_index("ix_users_email", table_name="users")


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("users")}
    if "username" in cols:
        op.drop_index("ix_users_username", table_name="users")
        op.drop_column("users", "username")
    idx = {i["name"]: i for i in insp.get_indexes("users")}
    if "ix_users_email" not in idx:
        op.create_index("ix_users_email", "users", ["email"], unique=True)
